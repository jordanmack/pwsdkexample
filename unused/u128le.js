const {Reader} = require("ckb-js-toolkit");

function hexToArrayBuffer(hexString)
{
	return new Reader(hexString).toArrayBuffer();
}

function arrayBufferToHex(arrayBuffer)
{
	return new Reader(arrayBuffer).serializeJson();
}

function bigIntToU128LeHexBytes(num)
{
	const arraybuffer = new ArrayBuffer(16);
	const data = new Uint8Array(arraybuffer);

	let bigInt = BigInt(num);
	for(let i = 0n; i < 16n; i++)
	{
		const posValue = (256n**(15n-i));
		data[15n-i] = Number(bigInt / posValue);
		bigInt -= bigInt / posValue * posValue;
	}

	return arrayBufferToHex(arraybuffer);
}

function u128LeHexBytesToBigInt(hexString)
{
	const arraybuffer = hexToArrayBuffer(hexString);
	const data = new Uint8Array(arraybuffer);

	let bigInt = 0n;
	for(let i = 0n; i < 16n; i++)
	{
		const posValue = 256n**i;
		bigInt += posValue * BigInt(data[i]);
	}

	return bigInt;
}
