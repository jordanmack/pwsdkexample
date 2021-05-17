import {Amount, AmountUnit, Cell, Collector, OutPoint, Script} from "@lay2/pw-core";

// const TOKEN_BUY_LOCK_OUT_POINT = ["0x2b0fc70c3a41d5db6d058429d70addbec1ee5453019bded2c858015a5ecf71f0", "0x0"]; // Token Buy Lock Script Out Point (Testnet)
const TOKEN_BUY_LOCK_CODE_HASH = "0xe818a52456bfc77ede036fd7b09a15f961a8227f188efec87794a44eac290c9b"; // Token Buy Lock Script Code Hash (Testnet)

export default class AuctionCollector extends Collector
{
	indexerUrl = null;

	constructor(indexerUrl)
	{
		super();
		this.indexerUrl = indexerUrl;
	}

	async collectBuyOrderCells(sudt, maxCells=false)
	{
		this.cells = [];

		const tokenBuyLockScript = new Script(TOKEN_BUY_LOCK_CODE_HASH, sudt.toTypeScript().toHash(), "data");

		const indexerQuery =
		{
			id: 2,
			jsonrpc: "2.0",
			method: "get_cells",
			params: 
			[
				{
					script: tokenBuyLockScript.serializeJson(),
					script_type: "lock"
				},
				"asc",
				"0x2710",
			]
		};

		const requestOptions =
		{
			method: "POST",
			body: JSON.stringify(indexerQuery),
			cache: "no-store",
			headers:
			{
				"Content-Type": "application/json",
			},
			mode: "cors",
		};

		const result = await (await fetch(this.indexerUrl, requestOptions)).json();

		const rawCells = result.result.objects;
		for(const rawCell of rawCells)
		{
			const amount = new Amount(rawCell.output.capacity, AmountUnit.shannon);
			const lockScript = Script.fromRPC(rawCell.output.lock);
			const typeScript = Script.fromRPC(rawCell.output.type);
			const outPoint = OutPoint.fromRPC(rawCell.out_point);
			const outputData = rawCell.output_data;

			const cell = new Cell(amount, lockScript, typeScript, outPoint, outputData);
			this.cells.push(cell);

			if(maxCells !== false && this.cells.length >= Number(maxCells))
				break;
		}

		return this.cells;
	}

	async collectBuyOrderCellsForAddress(sudt, address, maxCells=false)
	{
		const lockHash = address.toLockScript().toHash();

		const collectedCells = await this.collectBuyOrderCells(sudt, maxCells);
		// console.log(collectedCells);
		this.cells = []; // This must be cleared AFTER collectBuyOrderCells() since it also uses it.

		for(const cell of collectedCells)
		{
			const data = cell.getHexData();

			if(data.length < 98) continue; // "0x" + hex encoded 32 byte hash + 16 byte u128 amount.

			const ownerLockHash = data.substring(0, 66);
			// const amountToBuy = Amount.fromUInt128LE("0x"+data.substring(66, 98));
			// console.log(ownerLockHash, amountToBuy);

			// console.log(address.toCKBAddress(), address.toLockScript().toHash(), lockHash, ownerLockHash);

			if(lockHash === ownerLockHash)
				this.cells.push(cell);

			if(maxCells !== false && this.cells.length >= Number(maxCells))
				break;
		}

		return this.cells;
	}

	async collectCapacity(address, neededAmount)
	{
		this.cells = [];

		const indexerQuery =
		{
			id: 2,
			jsonrpc: "2.0",
			method: "get_cells",
			params: 
			[
				{
					script: address.toLockScript().serializeJson(),
					script_type: "lock",
				},
				"asc",
				"0x2710",
			]
		};

		const requestOptions =
		{
			method: "POST",
			body: JSON.stringify(indexerQuery),
			cache: "no-store",
			headers:
			{
				"Content-Type": "application/json",
			},
			mode: "cors",
		};
		const result = await (await fetch(this.indexerUrl, requestOptions)).json();

		let amountTotal = Amount.ZERO;
		const rawCells = result.result.objects;
		for(const rawCell of rawCells)
		{
			const amount = new Amount(rawCell.output.capacity, AmountUnit.shannon);
			const lockScript = Script.fromRPC(rawCell.output.lock);
			const typeScript = Script.fromRPC(rawCell.output.type);
			const outPoint = OutPoint.fromRPC(rawCell.out_point);
			const outputData = rawCell.output_data;

			if(typeScript === undefined || typeScript === null)
			{
				const cell = new Cell(amount, lockScript, typeScript, outPoint, outputData);
				this.cells.push(cell);
	
				amountTotal = amountTotal.add(amount)
				if(amountTotal.gte(neededAmount))
					break;
			}
		}

		if(amountTotal.lt(neededAmount))
			throw new Error(`Could not find enough input capacity. Needed ${neededAmount.toString(AmountUnit.ckb)}, found ${amountTotal.toString(AmountUnit.ckb)}.`);

		return this.cells;
	}

	async collectSUDT(sudt, address, neededAmount)
	{
		this.cells = [];

		const lockScript = address.toLockScript();
		const typeScript = sudt.toTypeScript();

		const indexerQuery =
		{
			id: 2,
			jsonrpc: "2.0",
			method: "get_cells",
			params: 
			[
				{
					script: lockScript.serializeJson(),
					script_type: "lock",
					filter:
					{
						script: typeScript.serializeJson(),
					}		
				},
				"asc",
				"0x2710",
			]
		};

		const requestOptions =
		{
			method: "POST",
			body: JSON.stringify(indexerQuery),
			cache: "no-store",
			headers:
			{
				"Content-Type": "application/json",
			},
			mode: "cors",
		};
		const result = await (await fetch(this.indexerUrl, requestOptions)).json();

		let amountSUDTTotal = Amount.ZERO;
		const rawCells = result.result.objects;
		for(const rawCell of rawCells)
		{
			const amount = new Amount(rawCell.output.capacity, AmountUnit.shannon);
			const amountSUDT = Amount.fromUInt128LE(rawCell.output_data.substring(0, 34));
			const lockScript = Script.fromRPC(rawCell.output.lock);
			const typeScript = Script.fromRPC(rawCell.output.type);
			const outPoint = OutPoint.fromRPC(rawCell.out_point);
			const outputData = rawCell.output_data;

			const cell = new Cell(amount, lockScript, typeScript, outPoint, outputData);
			this.cells.push(cell);

			amountSUDTTotal = amountSUDTTotal.add(amountSUDT)
			if(amountSUDTTotal.gte(neededAmount))
				break;
		}

		if(amountSUDTTotal.lt(neededAmount))
			throw new Error(`Could not find enough input SUDT cells. Needed ${neededAmount.toString(0)}, found ${amountSUDTTotal.toString(0)}.`);

		return this.cells;
	}

	async getCells(address)
	{
		this.cells = [];

		const indexerQuery =
		{
			id: 2,
			jsonrpc: "2.0",
			method: "get_cells",
			params: 
			[
				{
					script: address.toLockScript().serializeJson(),
					script_type: "lock",
				},
				"asc",
				"0x2710",
			]
		};

		const res = await (await fetch(this.indexerUrl,
		{
			method: "POST",
			body: JSON.stringify(indexerQuery),
			cache: "no-store",
			headers:
			{
				"Content-Type": "application/json",
			},
			mode: "cors",
		})).json();

		const rawCells = res.result.objects;

		for(const rawCell of rawCells)
		{
			const amount = new Amount(rawCell.output.capacity, AmountUnit.shannon);
			const lockScript = Script.fromRPC(rawCell.output.lock);
			const typeScript = Script.fromRPC(rawCell.output.type);
			const outPoint = OutPoint.fromRPC(rawCell.out_point);
			const outputData = rawCell.output_data;

			const cell = new Cell(amount, lockScript, typeScript, outPoint, outputData);
			this.cells.push(cell);
		}
		return this.cells;
	}

	async getBalance(address)
	{
		const cells = await this.getCells(address);

		if (!cells.length)
			return Amount.ZERO;

		const balance = cells
			.map((c) => c.capacity)
			.reduce((sum, cap) => (sum = sum.add(cap)));
		
		return balance;
	}

	async getSUDTBalance(sudt, address)
	{
		const cells = await this.getCells(address);

		if(!cells.length)
			return Amount.ZERO;

		const sudtTypeHash = sudt.toTypeScript().toHash();
		let balance = new Amount(0, 0);
		
		for(const cell of cells)
		{
			if(!!cell.type && cell.type.toHash() === sudtTypeHash && cell.data.length >= 34)
			// if(!!cell.type && cell.data.length >= 34)
			{
				const cellAmountData = cell.data.substring(0, 34);
				const amount = Amount.fromUInt128LE(cellAmountData);
				balance = balance.add(amount);
			}
		}

		return balance;
	}

	async collect(address, { withData }) {
		const cells = await this.getCells(address);

		if (withData) {
			return cells.filter((c) => !c.isEmpty() && !c.type);
		}

		return cells.filter((c) => c.isEmpty() && !c.type);
	}
}