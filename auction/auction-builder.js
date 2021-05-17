import PWCore, {Address, AddressType, Amount, AmountUnit, Builder, Cell, CellDep, ECDSA_WITNESS_LEN, OutPoint, RawTransaction, Script, Transaction} from "@lay2/pw-core";

const TOKEN_BUY_LOCK_OUT_POINT = ["0x2b0fc70c3a41d5db6d058429d70addbec1ee5453019bded2c858015a5ecf71f0", "0x0"]; // Token Buy Lock Script Out Point (Testnet)
const TOKEN_BUY_LOCK_CODE_HASH = "0xe818a52456bfc77ede036fd7b09a15f961a8227f188efec87794a44eac290c9b"; // Token Buy Lock Script Code Hash (Testnet)

export default class AuctionBuilder extends Builder
{
	constructor()
	{
		super();
	}

	async build(action, options)
	{
		if(action === "mint")
		{
			// Aliases
			const address = options.address;
			const amount = options.amount;
			const collector = options.collector;
			const fee = options.fee;
			const sudt = options.sudt;

			// Arrays for our input cells, output cells, and cell deps, which will be used in the final transaction.
			const inputCells = [];
			const outputCells = [];
			const cellDeps = [];

			// Create the SUDT output cell.
			const typeScript = sudt.toTypeScript();
			const lockScript = address.toLockScript();
			const sudtCell = new Cell(new Amount(142, AmountUnit.ckb), lockScript, typeScript, null, amount.toUInt128LE());
			// sudtCell.resize();
			outputCells.push(sudtCell);

			// Calculate the required capacity. (SUDT cell + change cell minimum (61) + fee)
			const neededAmount = sudtCell.capacity.add(new Amount(61, AmountUnit.ckb)).add(fee);

			// Add necessary capacity.
			const capacityCells = await collector.collectCapacity(address, neededAmount);
			for(const cell of capacityCells)
				inputCells.push(cell);

			// Calculate the input capacity and change cell amounts.
			const inputCapacity = inputCells.reduce((a, c)=>a.add(c.capacity), Amount.ZERO);
			const changeCapacity = inputCapacity.sub(neededAmount.sub(new Amount(61, AmountUnit.ckb)));

			// Add the change cell.
			const changeCell = new Cell(changeCapacity, lockScript);
			outputCells.push(changeCell);

			// Add the required cell deps.
			cellDeps.push(PWCore.config.defaultLock.cellDep);
			cellDeps.push(PWCore.config.pwLock.cellDep);
			cellDeps.push(PWCore.config.sudtType.cellDep);

			// Generate a transaction and calculate the fee. (The second argument for witness args is needed for more accurate fee calculation.)
			const tx = new Transaction(new RawTransaction(inputCells, outputCells, cellDeps), [Builder.WITNESS_ARGS.Secp256k1]);
			this.fee = Builder.calcFee(tx);

			// Throw error if the fee is too low.
			if(this.fee.gt(fee))
				throw new Error(`Fee of ${fee} is below the calculated fee requirements of ${this.fee}.`);

			// Return our unsigned and non-broadcasted transaction.
			return tx;
		}
		else if(action === "burn")
		{
			// Aliases
			const address = options.address;
			const amount = options.amount;
			const collector = options.collector;
			const fee = options.fee;
			const sudt = options.sudt;

			// Arrays for our input cells, output cells, and cell deps, which will be used in the final transaction.
			const inputCells = [];
			const outputCells = [];
			const cellDeps = [];

			// Add the SUDT input cells.
			const sudtCells = await collector.collectSUDT(sudt, address, amount);
			for(const cell of sudtCells)
				inputCells.push(cell);

			// Add an SUDT change cell, if needed.
			const inputSUDTAmount = inputCells.reduce((a, c)=>a.add(c.getSUDTAmount()), Amount.ZERO);
			if(inputSUDTAmount.sub(amount).gt(Amount.ZERO))
			{
				const typeScript = sudt.toTypeScript();
				const lockScript = address.toLockScript();
				const sudtCell = new Cell(new Amount(1420, AmountUnit.ckb), lockScript, typeScript, null, inputSUDTAmount.sub(amount).toUInt128LE());
				// sudtCell.resize();
				outputCells.push(sudtCell);
			}

			// Calculate the capacity amounts.
			let inputCapacity = inputCells.reduce((a, c)=>a.add(c.capacity), Amount.ZERO);
			let outputCapacity = outputCells.reduce((a, c)=>a.add(c.capacity), Amount.ZERO);

			// Determine if more capacity is needed. (Input capacity - output capacity - change cell (61) - tx fee)
			if(inputCapacity.sub(outputCapacity).sub(new Amount(61, AmountUnit.ckb)).sub(fee).lt(Amount.ZERO))
			{
				const requiredCapacity = outputCapacity.add(new Amount(61, AmountUnit.ckb)).add(fee).sub(inputCapacity);
				const capacityCells = await collector.collectCapacity(address, requiredCapacity);
				for(const cell of capacityCells)
					inputCells.push(cell);
			}

			// Recalculate the input/output capacity amounts and the change cell amount.
			inputCapacity = inputCells.reduce((a, c)=>a.add(c.capacity), Amount.ZERO);
			outputCapacity = outputCells.reduce((a, c)=>a.add(c.capacity), Amount.ZERO);
			const changeCapacity = inputCapacity.sub(outputCapacity).sub(fee);

			// Add the change cell.
			const changeCell = new Cell(changeCapacity, address.toLockScript());
			outputCells.push(changeCell);

			// Add the required cell deps.
			cellDeps.push(PWCore.config.defaultLock.cellDep);
			cellDeps.push(PWCore.config.pwLock.cellDep);
			cellDeps.push(PWCore.config.sudtType.cellDep);

			// Generate a transaction and calculate the fee. (The second argument for witness args is needed for more accurate fee calculation.)
			const tx = new Transaction(new RawTransaction(inputCells, outputCells, cellDeps), [Builder.WITNESS_ARGS.Secp256k1]);
			this.fee = Builder.calcFee(tx);

			// Throw error if the fee is too low.
			if(this.fee.gt(fee))
				throw new Error(`Fee of ${fee} is below the calculated fee requirements of ${this.fee}.`);

			// Return our unsigned and non-broadcasted transaction.
			return tx;
		}
		else if(action === "token-buy")
		{
			// Aliases
			const address = options.address;
			const amount = options.amount;
			const collector = options.collector;
			const fee = options.fee;
			const sudt = options.sudt;

			// Arrays for our input cells, output cells, and cell deps, which will be used in the final transaction.
			const inputCells = [];
			const outputCells = [];
			const cellDeps = [];

			// Add the token buy cell.
			const tokenBuyLockScript = new Script(TOKEN_BUY_LOCK_CODE_HASH, sudt.toTypeScript().toHash(), "data");
			const cellData = address.toLockScript().toHash() + amount.toUInt128LE().substring(2); // Hex string of the SUDT type script hash and the amount of tokens to buy.
			const tokenBuyCell = new Cell(new Amount(121, AmountUnit.ckb), tokenBuyLockScript, null, null, cellData);
			outputCells.push(tokenBuyCell);

			// Calculate the capacity amounts.
			let inputCapacity = inputCells.reduce((a, c)=>a.add(c.capacity), Amount.ZERO);
			let outputCapacity = outputCells.reduce((a, c)=>a.add(c.capacity), Amount.ZERO);

			// Determine if more capacity is needed. (Input capacity - output capacity - change cell (61) - tx fee)
			if(inputCapacity.sub(outputCapacity).sub(new Amount(61, AmountUnit.ckb)).sub(fee).lt(Amount.ZERO))
			{
				const requiredCapacity = outputCapacity.add(new Amount(61, AmountUnit.ckb)).add(fee).sub(inputCapacity);
				const capacityCells = await collector.collectCapacity(address, requiredCapacity);
				for(const cell of capacityCells)
					inputCells.push(cell);
			}

			// Recalculate the input/output capacity amounts and the change cell amount.
			inputCapacity = inputCells.reduce((a, c)=>a.add(c.capacity), Amount.ZERO);
			outputCapacity = outputCells.reduce((a, c)=>a.add(c.capacity), Amount.ZERO);
			const changeCapacity = inputCapacity.sub(outputCapacity).sub(fee);

			// Add the change cell.
			const changeCell = new Cell(changeCapacity, address.toLockScript());
			outputCells.push(changeCell);

			// Add the required cell deps.
			cellDeps.push(PWCore.config.defaultLock.cellDep);
			cellDeps.push(PWCore.config.pwLock.cellDep);
			// cellDeps.push(PWCore.config.sudtType.cellDep);
			cellDeps.push(new CellDep("code", new OutPoint(TOKEN_BUY_LOCK_OUT_POINT[0], TOKEN_BUY_LOCK_OUT_POINT[1])));

			// Generate a transaction and calculate the fee. (The second argument for witness args is needed for more accurate fee calculation.)
			const tx = new Transaction(new RawTransaction(inputCells, outputCells, cellDeps), [Builder.WITNESS_ARGS.Secp256k1]);
			this.fee = Builder.calcFee(tx);

			// Throw error if the fee is too low.
			if(this.fee.gt(fee))
				throw new Error(`Fee of ${fee} is below the calculated fee requirements of ${this.fee}.`);

			// Return our unsigned and non-broadcasted transaction.
			return tx;
		}
		else if(action === "sweep")
		{
			// Aliases
			const address = options.address;
			const addresses = options.addresses;
			const collector = options.collector;
			const fee = options.fee;
			const sudt = options.sudt;

			// Arrays for our input cells, output cells, and cell deps, which will be used in the final transaction.
			const inputCells = [];
			const outputCells = [];
			const cellDeps = [];

			// Add an initial capacity cell. This is a workaround for a limitation of the eth-signer that requires it sign for witness[0].
			const requiredCapacity = new Amount(61, AmountUnit.ckb);
			const capacityCells = await collector.collectCapacity(address, requiredCapacity);
			for(const cell of capacityCells)
				inputCells.push(cell);

			// Add valid Token Buy cells to inputs and fulfill with an SUDT in outputs.
			const buyOrderCells = await PWCore.defaultCollector.collectBuyOrderCells(sudt);
			for(const buyOrderCell of buyOrderCells)
			{
				const orderOwner = buyOrderCell.data.substring(0, 66);
				const orderAmount = Amount.fromUInt128LE("0x"+buyOrderCell.data.substring(66, 98));
				
				for(const potentialAddress of addresses)
				{
					const address = new Address(potentialAddress, AddressType.ckb);
					const lockScript = address.toLockScript();
					const lockHash = lockScript.toHash();

					if(lockHash === orderOwner)
					{
						inputCells.push(buyOrderCell);

						const sudtCell = new Cell(new Amount(142, AmountUnit.ckb), lockScript, sudt.toTypeScript(), null, orderAmount.toUInt128LE());
						outputCells.push(sudtCell);

						break;
					}
				}
			}

			// Calculate the capacity amounts.
			let inputCapacity = inputCells.reduce((a, c)=>a.add(c.capacity), Amount.ZERO);
			let outputCapacity = outputCells.reduce((a, c)=>a.add(c.capacity), Amount.ZERO);

			// Determine if more capacity is needed. (Input capacity - output capacity - change cell (61) - tx fee)
			if(inputCapacity.sub(outputCapacity).sub(new Amount(61, AmountUnit.ckb)).sub(fee).lt(Amount.ZERO))
			{
				const requiredCapacity = outputCapacity.add(new Amount(61, AmountUnit.ckb)).add(fee).sub(inputCapacity);
				const capacityCells = await collector.collectCapacity(address, requiredCapacity);
				for(const cell of capacityCells)
					inputCells.push(cell);
			}

			// Recalculate the input/output capacity amounts and the change cell amount.
			inputCapacity = inputCells.reduce((a, c)=>a.add(c.capacity), Amount.ZERO);
			outputCapacity = outputCells.reduce((a, c)=>a.add(c.capacity), Amount.ZERO);
			const changeCapacity = inputCapacity.sub(outputCapacity).sub(fee);

			// Add the change cell.
			const changeCell = new Cell(changeCapacity, address.toLockScript());
			outputCells.push(changeCell);

			// Add the required cell deps.
			cellDeps.push(PWCore.config.defaultLock.cellDep);
			cellDeps.push(PWCore.config.pwLock.cellDep);
			cellDeps.push(PWCore.config.sudtType.cellDep);
			cellDeps.push(new CellDep("code", new OutPoint(TOKEN_BUY_LOCK_OUT_POINT[0], TOKEN_BUY_LOCK_OUT_POINT[1])));

			// Create the witnessArgs and witnessLengths for the first witness only. All other input cells will not require witness entries.
			const witnessArgs = [Builder.WITNESS_ARGS.Secp256k1];
			const witnessLengths = [ECDSA_WITNESS_LEN];

			// Generate a transaction and calculate the fee. (The second argument for witness args is needed for more accurate fee calculation.)
			const tx = new Transaction(new RawTransaction(inputCells, outputCells, cellDeps), witnessArgs, witnessLengths);
			this.fee = Builder.calcFee(tx);

			// Throw error if the fee is too low.
			if(this.fee.gt(fee))
				throw new Error(`Fee of ${fee} is below the calculated fee requirements of ${this.fee}.`);

			// Return our unsigned and non-broadcasted transaction.
			return tx;
		}
		else
			throw new Error("Invalid action specified.");
	}
}