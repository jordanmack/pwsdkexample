import * as React from "react";
import {useState, useEffect} from "react";
import * as ReactDOM from "react-dom";

import PWCore, {Address, AddressType, Amount, AmountUnit, EthProvider, SUDT} from "@lay2/pw-core";
import AuctionCollector from "./auction-collector.js";
import AuctionBuilder from "./auction-builder.js";

import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./index.scss";

const CKB_RPC_URL = "http://3.236.254.238:8114";
const CKB_INDEXER_URL = "http://3.236.254.238:8116";

async function initPwCore()
{
	const provider = new EthProvider();
	const collector = new AuctionCollector(CKB_INDEXER_URL);
	const pwCore = await new PWCore(CKB_RPC_URL).init(provider, collector);

	return pwCore;
}

async function getBalances(setData)
{

	const address = new Address(PWCore.provider.address.addressString, AddressType.eth);
	const capacity = await PWCore.defaultCollector.getBalance(address);
	const sudtBalance = await PWCore.defaultCollector.getSUDTBalance(new SUDT(PWCore.provider.address.toLockScript().toHash()), PWCore.provider.address);

	const data = {address, capacity, sudtBalance};

	setData(data);
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
		sudt: new SUDT(PWCore.provider.address.toLockScript().toHash())
	};
	const transaction = await builder.build("burn", options);
	console.log(transaction);

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
		sudt: new SUDT(PWCore.provider.address.toLockScript().toHash())
	};
	const transaction = await builder.build("mint", options);
	// console.log(transaction);

	const tx_id = await pwCore.sendTransaction(transaction);
	console.log(`Transaction submitted: ${tx_id}`);

	toast("Transaction has been submitted.");
}

function PrimaryComponent(props)
{
	const [data, setData] = useState(null);

	const handleRefreshData = () =>
	{
		setData(null);
		getBalances(setData);
	};

	const handleMintSudt = (amount) =>
	{
		mintSudt(props.pwCore, new Amount(amount, 0));
		getBalances(setData);
	};

	const handleBurnSudt = (amount) =>
	{
		burnSudt(props.pwCore, new Amount(amount, 0));
		getBalances(setData);
	};

	useEffect(()=>getBalances(setData), [true]);

	let html = <main>Loading...</main>;
	if(data !== null)
	{
		html =
		(
			<main>
				<table>
					<tbody>
						<tr>
							<td>ETH Address:</td>
							<td>{PWCore.provider.address.addressString}</td>
						</tr>
						<tr><td colSpan="2">&nbsp;</td></tr>
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
						<tr><td colSpan="2">&nbsp;</td></tr>
						<tr>
							<td>SUDT Token ID:</td>
							<td>{data.address.toLockScript().toHash()}</td>
						</tr>
						<tr>
							<td>SUDT Balance:</td>
							<td>{data.sudtBalance.toString(0)}</td>
						</tr>
					</tbody>
				</table>
				<br />
				<div id="button-bar">
				<button onClick={()=>handleMintSudt(50)}>Mint 50 SUDT</button>
					<span className="spacer" />
					<button onClick={()=>handleMintSudt(100)}>Mint 100 SUDT</button>
					<span className="spacer" />
					<button onClick={()=>handleBurnSudt(50)}>Burn 50 SUDT</button>
					<span className="spacer" />
					<button onClick={()=>handleBurnSudt(100)}>Burn 100 SUDT</button>
					<span className="spacer" />
					<button onClick={handleRefreshData}>Refresh Balances</button>
				</div>
				<ToastContainer />
			</main>
		);
	}

	return html;
}

async function main()
{
	const pwCore = await initPwCore();

	const html =
	(
		<React.StrictMode>
			<PrimaryComponent pwCore={pwCore} />
		</React.StrictMode>
	);
	ReactDOM.render(html, document.getElementById("root"));
}
main();

