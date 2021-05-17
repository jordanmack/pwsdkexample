import * as React from "react";
import {useState, useEffect} from "react";
import * as ReactDOM from "react-dom";
import EventEmitter from "events";
import PWCore, {Address, AddressType, Amount, AmountUnit, EthProvider, OutPoint, SUDT} from "@lay2/pw-core";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import AuctionCollector from "./auction-collector.js";
import AuctionBuilder from "./auction-builder.js";
import "./index.scss";

const CKB_RPC_URL = "http://3.236.254.238:8114";		// Public Testnet CKB RPC (temporary)
const CKB_INDEXER_URL = "http://3.236.254.238:8116";	// Public Testnet CKB Indexer (temporary)
const EE = new EventEmitter();

function initLocalStorage()
{
	if(localStorage.getItem("CKBAddresses") === null)
	{
		localStorage.setItem("CKBAddresses", JSON.stringify([]));
	}

	if(localStorage.getItem("SUDTTokenId") === null)
	{
		localStorage.setItem("SUDTTokenId", PWCore.provider.address.toLockScript().toHash());
	}

	return localStorage;
}

async function initPwCore()
{
	const provider = new EthProvider((newAddress)=>{EE.emit("EthereumAddressChange", newAddress)});
	const collector = new AuctionCollector(CKB_INDEXER_URL);
	const pwCore = await new PWCore(CKB_RPC_URL).init(provider, collector);

	return pwCore;
}

function initAddressTracker()
{
	// Setup the changed address handler.
	EE.on("EthereumAddressChange", (newAddress)=>
	{
		const ckbAddress = newAddress.toCKBAddress();

		const ckbAddresses = getAddressTracker();
		if(!ckbAddresses.includes(ckbAddress))
		{
			ckbAddresses.push(ckbAddress);
			setAddressTracker(ckbAddresses);
		}
	});

	// Trigger the handler with the current address.
	EE.emit("EthereumAddressChange", PWCore.provider.address);
}

function getAddressTracker()
{
	return JSON.parse(localStorage.getItem("CKBAddresses"));
}

function setAddressTracker(addresses)
{
	localStorage.setItem("CKBAddresses", JSON.stringify(addresses));
}

async function getBalances()
{
	const address = new Address(PWCore.provider.address.addressString, AddressType.eth);
	const capacity = await PWCore.defaultCollector.getBalance(address);
	const sudtBalance = await PWCore.defaultCollector.getSUDTBalance(new SUDT(localStorage.getItem("SUDTTokenId")), PWCore.provider.address);

	const data = {address, capacity, sudtBalance};

	return data;
}

async function getAddressData(addresses)
{
	const data = [];

	for(const ckbAddress of addresses)
	{
		const address = new Address(ckbAddress, AddressType.ckb);
		const capacity = await PWCore.defaultCollector.getBalance(address);
		const openBuyOrders = (await PWCore.defaultCollector.collectBuyOrderCellsForAddress(new SUDT(localStorage.getItem("SUDTTokenId")), address)).length;
		const sudtBalance = await PWCore.defaultCollector.getSUDTBalance(new SUDT(localStorage.getItem("SUDTTokenId")), address);

		data.push({address, capacity, openBuyOrders, sudtBalance});
	}

	return data;
}

function generateAddressRows(addressData)
{
	const rows = [];

	for(const [i, data] of addressData.entries())
	{
		const row =
		(
			<tr key={i}>
				<td>{data.address.toCKBAddress()}</td>
				<td>{data.openBuyOrders}</td>
				<td>{Number(data.capacity.toString(AmountUnit.ckb)).toLocaleString()}</td>
				<td>{Number(data.sudtBalance.toString(0)).toLocaleString()}</td>
			</tr>
		);
		rows.push(row);
	}

	return rows;
}

async function getOrderData(addresses)
{
	const data = [];

	const openBuyOrders = await PWCore.defaultCollector.collectBuyOrderCells(new SUDT(localStorage.getItem("SUDTTokenId")));

	for(const order of openBuyOrders)
	{
		if(order.data.length < 98)
			continue;
		
		const orderAddress = order.lock.toAddress();
		const orderOwnerLockHash = order.data.substring(0, 66);

		let address = null;
		for(const a of addresses)
		{
			const addressLockHash = (new Address(a, AddressType.ckb)).toLockScript().toHash();
			if(addressLockHash === orderOwnerLockHash)
			{
				address = a;
				break;
			}	
		}
		if(address === null)
			address = orderOwnerLockHash;

		const capacity = order.capacity;
		const orderAmount = Amount.fromUInt128LE("0x"+order.data.substring(66, 98));

		data.push({address, capacity, orderAmount});
	}

	return data;
}

function generateOrderRows(orderData)
{
	const rows = [];

	for(const [i, data] of orderData.entries())
	{
		const row =
		(
			<tr key={i}>
				<td>{data.address}</td>
				<td>{Number(data.capacity.toString(AmountUnit.ckb)).toLocaleString()}</td>
				<td>{Number(data.orderAmount.toString(0)).toLocaleString()}</td>
			</tr>
		);
		rows.push(row);
	}

	return rows;
}

async function burnSudt(pwCore, amount)
{
	const builder = new AuctionBuilder();

	const options =
	{
		address: PWCore.provider.address,
		amount: amount,
		collector: PWCore.defaultCollector,
		fee: new Amount(100_000, AmountUnit.shannon),
		sudt: new SUDT(localStorage.getItem("SUDTTokenId"))
	};
	const transaction = await builder.build("burn", options);
	// console.log(transaction);

	const tx_id = await pwCore.sendTransaction(transaction);
	console.log(`Transaction submitted: ${tx_id}`);

	toast("Transaction has been submitted.");
}

async function mintSudt(pwCore, amount)
{
	const builder = new AuctionBuilder();

	const options =
	{
		address: PWCore.provider.address,
		amount: amount,
		collector: PWCore.defaultCollector,
		fee: new Amount(100_000, AmountUnit.shannon),
		sudt: new SUDT(localStorage.getItem("SUDTTokenId"))
	};
	const transaction = await builder.build("mint", options);
	// console.log(transaction);

	const tx_id = await pwCore.sendTransaction(transaction);
	console.log(`Transaction submitted: ${tx_id}`);

	toast("Transaction has been submitted.");
}

async function tokenBuy(pwCore, amount)
{
	const builder = new AuctionBuilder();

	const options =
	{
		address: PWCore.provider.address,
		amount: amount,
		collector: PWCore.defaultCollector,
		fee: new Amount(100_000, AmountUnit.shannon),
		sudt: new SUDT(localStorage.getItem("SUDTTokenId"))
	};
	const transaction = await builder.build("token-buy", options);
	console.log(transaction);

	const tx_id = await pwCore.sendTransaction(transaction);
	console.log(`Transaction submitted: ${tx_id}`);

	toast("Transaction has been submitted.");
}

async function sweep(pwCore, addresses)
{
	const builder = new AuctionBuilder();

	const options =
	{
		address: PWCore.provider.address,
		addresses: addresses,
		collector: PWCore.defaultCollector,
		fee: new Amount(100_000, AmountUnit.shannon),
		sudt: new SUDT(localStorage.getItem("SUDTTokenId"))
	};
	const transaction = await builder.build("sweep", options);
	console.log(transaction);

	const tx_id = await pwCore.sendTransaction(transaction);
	console.log(`Transaction submitted: ${tx_id}`);

	// toast("Transaction has been submitted.");
}

function PrimaryComponent(props)
{
	const [data, setData] = useState(null);
	const [addresses, setAddresses] = useState(getAddressTracker());
	const [addressData, setAddressData] = useState([]);
	const [orderData, setOrderData] = useState([]);

	const handleRefreshData = async () =>
	{
		setData(null);
		setData(await getBalances());
		setAddressData(await getAddressData(addresses));
		setOrderData(await getOrderData(addresses));
	};

	const handleMintSudt = async (amount) =>
	{
		mintSudt(props.pwCore, new Amount(amount, 0));
		setData(await getBalances());
	};

	const handleBurnSudt = async (amount) =>
	{
		burnSudt(props.pwCore, new Amount(amount, 0));
		setData(await getBalances());
	};

	const handleSweep = async () =>
	{
		sweep(props.pwCore, addresses);
	};

	const handleTokenBuy = async (amount) =>
	{
		tokenBuy(props.pwCore, new Amount(amount, 0));
	};

	const handleResetAddresses = async () =>
	{
		const addresses = [PWCore.provider.address.toCKBAddress()];
		setAddressTracker(addresses);
		setAddresses(addresses);
		setAddressData(await getAddressData(addresses));
		setOrderData(await getOrderData(addresses));
	};

	const handleSetSudt = async () =>
	{
		localStorage.setItem("SUDTTokenId", PWCore.provider.address.toLockScript().toHash());
		setData(await getBalances());
		setAddressData(await getAddressData(addresses));
		setOrderData(await getOrderData(addresses));
	};

	// Trigger initial data update.
	useEffect(async ()=>
	{
		setData(await getBalances());
		setAddresses(getAddressTracker());
		setAddressData(await getAddressData(addresses));
		setOrderData(await getOrderData(addresses));
	}, [true]);

	// Setup Ethereum Address change handler.
	useEffect(async ()=>
	{
		EE.on("EthereumAddressChange", async (_newAddress)=>
		{
			setTimeout(async ()=>
			{
				setData(await getBalances());
				setAddressData(await getAddressData(addresses));
			}, 0);
		});
	}, [true]);

	let html = <main>Loading...</main>;
	if(data !== null)
	{
		html =
		(
			<main>
				<h2>Buyer</h2>
				<table className="balances">
					<tbody>
						<tr>
							<td>ETH Address:</td>
							<td>{PWCore.provider.address.addressString}</td>
						</tr>
						<tr>
							<td>CKB Address:</td>
							<td>{data.address.toCKBAddress()}</td>
						</tr>
						<tr>
							<td>CKB Balance:</td>
							<td>
								{Number(data.capacity.toString(AmountUnit.ckb)).toLocaleString()} CKBytes
								&nbsp;
								{(data.capacity.toHexString()==="0x0") && <a href="https://faucet.nervos.org/" target="_blank">Testnet Faucet</a> }
							</td>
						</tr>
						<tr>
							<td>SUDT Token ID:</td>
							<td>{localStorage.getItem("SUDTTokenId")} {(localStorage.getItem("SUDTTokenId")===PWCore.provider.address.toLockScript().toHash()) && "(Current User)"}</td>
						</tr>
						<tr>
							<td>SUDT Balance:</td>
							<td>{Number(data.sudtBalance.toString(0)).toLocaleString()}</td>
						</tr>
					</tbody>
				</table>
				<br />
				<table className="addresses">
					<thead>
						<tr>
							<th>CKB Address</th>
							<th>Orders</th>
							<th>CKBytes</th>
							<th>SUDTs</th>
						</tr>
					</thead>
					<tbody>
						{generateAddressRows(addressData)}
					</tbody>
				</table>
				<br />
				<div id="button-bar">
					{/* <button onClick={()=>handleMintSudt(50)}>Mint 50 SUDT</button> */}
					{/* <span className="spacer" /> */}
					{/* <button onClick={()=>handleMintSudt(100)}>Mint 100 SUDT</button> */}
					{/* <span className="spacer" /> */}
					{/* <button onClick={()=>handleBurnSudt(50)}>Burn 50 SUDT</button> */}
					{/* <span className="spacer" /> */}
					{/* <button onClick={()=>handleBurnSudt(100)}>Burn 100 SUDT</button> */}
					{/* <span className="spacer" /> */}
					<button onClick={()=>handleTokenBuy(100)}>Buy 100 Tokens</button>
					<span className="spacer" />
					<button onClick={handleSetSudt}>Set SUDT Owner To Current</button>
					<span className="spacer" />
					<button onClick={handleRefreshData}>Refresh Balances</button>
					{/* <span className="spacer" /> */}
					{/* <button onClick={handleResetAddresses}>Reset Addresses</button> */}
				</div>
				<br />
				<br />
				<br />
				<h2>Seller / Aggregator / Deal Maker</h2>
				<table className="balances">
					<tbody>
						<tr>
							<td>SUDT Token ID:</td>
							<td>{localStorage.getItem("SUDTTokenId")} {(localStorage.getItem("SUDTTokenId")===PWCore.provider.address.toLockScript().toHash()) && "(Current User)"}</td>
						</tr>
					</tbody>
				</table>
				<br />
				<table className="orders">
					<thead>
						<tr>
							<th>CKB Address / Lock Hash</th>
							<th>CKBytes Provided</th>
							<th>SUDT Ordered</th>
						</tr>
					</thead>
					<tbody>
						{generateOrderRows(orderData)}
					</tbody>
				</table>
				<div id="button-bar">
					{/* <button onClick={}></button> */}
					<span className="spacer" />
				</div>
				{(localStorage.getItem("SUDTTokenId")!==PWCore.provider.address.toLockScript().toHash()) &&
					<div className="sweep-error">
						You must select the SUDT owner in MetaMask in order to sweep properly.
					</div>
				}
				<div id="button-bar">
					<button onClick={handleSweep}>Sweep and Fulfill All Orders</button>
					{/* <span className="spacer" /> */}
				</div>
				<ToastContainer />
			</main>
		);
	}

	return html;
}

async function main()
{
	// Initialization.
	const pwCore = await initPwCore();
	const _ls = initLocalStorage();
	initAddressTracker();

	const html =
	(
		<React.StrictMode>
			<PrimaryComponent pwCore={pwCore} />
		</React.StrictMode>
	);
	ReactDOM.render(html, document.getElementById("root"));
}
main();

