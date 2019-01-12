import React, { Component } from "react";
import { Tab, Tabs, TabList, TabPanel } from 'react-tabs';
import "react-tabs/style/react-tabs.css";

import SimpleStorageContract from "./contracts/SimpleStorage.json";
import LeasableCarContract from "./contracts/LeasableCar.json";
import LeaseAgreementContract from "./contracts/LeaseAgreement.json";
import getWeb3 from "./utils/getWeb3";

import ConnectionStatusCard from "./ConnectionStatus";
import SimpleStorageWrite from "./SimpleStorageWrite";
import SimpleStorageRead from "./SimpleStorageRead";

var truffle_contract = require("truffle-contract");
var web3 = require("web3");


function weiToEther(weis) {
  return web3.utils.fromWei(weis.toString());
}

function ts_to_str(epoch_secs_bignumber) {
  let epoch_ms = epoch_secs_bignumber.toNumber() * 1000;
  return new Date(epoch_ms).toLocaleString();
}

class App extends Component {
  state = { 
    web3: null, 
    accounts: null, 
    storage_contract: null,
    car_contract_spec: null,
    the_car: null,
    lease_agreement_spec: null,
    lease_agreement: null,
  };

  componentDidMount = async () => {
    try {
      // Get network provider and web3 instance.
      const web3 = await getWeb3();

      // Use web3 to get the user's accounts.
      // We'll need this to make a call to the contract
      const accounts = await web3.eth.getAccounts();
      const account = accounts[0];

      var storage_contract_spec = truffle_contract(SimpleStorageContract);
      storage_contract_spec.setProvider(web3.currentProvider);
      var storage_contract = await storage_contract_spec.deployed();

      // We're just going the store the 'spec' of the contract. It not a
      // particular instance of a deployed contract. Need the address to do that
      var car_contract_spec = truffle_contract(LeasableCarContract);
      car_contract_spec.setProvider(web3.currentProvider);

      var lease_agreement_spec = truffle_contract(LeaseAgreementContract);
      lease_agreement_spec.setProvider(web3.currentProvider);

      // Set web3, accounts, and contract to the state so that other 
      // components can access it
      this.setState({ 
        web3, 
        accounts, 
        account,
        storage_contract, 
        car_contract_spec,
        lease_agreement_spec,
      });
      
    } catch (error) {
      alert(
        `Failed to load web3, accounts, or contract. Check console for details.`,
      );
      console.error(error);
    }
  };

  render() {
    if (!this.state.web3) {
      return <div>Loading Web3, accounts, and contract...</div>;
    }

    let contract_status;
    if (!this.state.storage_contract.address) {
      contract_status = <li>Contract is not deployed!</li>
    } else {
      contract_status = <li>Contract deployed at: {this.state.storage_contract.address}</li>
    }

    return (
      <div className="container">
      <Tabs>
        <TabList>
          <Tab>Leaser</Tab>
          <Tab>SimpleStorage</Tab>
          <Tab>Status</Tab>
        </TabList>

        <TabPanel>
        <div className="row">
          <div className="col-sm-10">
            <h2>Leaser</h2>
            <div className="alert alert-light" role="alert">
              Account: {this.state.account}
            </div>
            <LookupCarForm
              car_contract_spec={this.state.car_contract_spec} 
              lease_agreement_spec={this.state.lease_agreement_spec} 
              accounts={this.state.accounts} />
          </div>
        </div>
        </TabPanel>

        <TabPanel>
        <div className="row">
          <div className="col-sm-10">

            <div className="card">
              <div className="card-body">
                <h5 className="card-title">SimpleStorage.sol Demo</h5>
                <p className="card-text">
                  <ul>
                    {contract_status}
                  </ul>
                </p>
              </div>
            </div>
            <SimpleStorageWrite 
              storage_contract={this.state.storage_contract} 
              account={this.state.accounts[0]} />
            <SimpleStorageRead
              storage_contract={this.state.storage_contract} 
              account={this.state.accounts[0]} />    
          </div>
        </div>
      </TabPanel>

        <TabPanel>
        <div className="row">
          <div className="col-md-10">

          <ConnectionStatusCard 
            accounts={this.state.accounts}
            web3={this.state.web3}
          />

          </div>
        </div>
      </TabPanel>

      </Tabs>
      </div>
    );
  }
}

export default App;

class LookupCarForm extends React.Component {
  constructor(props) {
    super(props);
    this.handleCarLookup = this.handleCarLookup.bind(this);
    this.car_address_input = React.createRef();
    this.agreement_address_input = React.createRef();
    this.state = {
      car_contract_spec: this.props.car_contract_spec,
      lease_agreement_spec: this.props.lease_agreement_spec,
      accounts: this.props.accounts,
      lease_start_timestamp: 0,
      lease_end_timestamp: 0,
      lease_driver: 0,
      car_lookup_error: "",
    }
  }

  handleCarLookup = async (event) => {
    event.preventDefault();

    var car_address = this.car_address_input.current.value;

    let the_car;
    try {
      the_car = await this.state.car_contract_spec.at(car_address);
    } catch (error) {
      console.log(error)
      this.setState({
        car_lookup_error: error.message,
      })
      return;
    }

    let car_vin = await the_car.VIN.call();
    let car_owner = await the_car.owner.call();
    let car_daily_rate_wei = await the_car.daily_rate.call();
    let car_daily_rate = weiToEther(car_daily_rate_wei);

    this.setState({ 
      the_car,
      car_vin,
      car_owner,
      car_daily_rate: car_daily_rate,
     });
  }

  handleAgreementLookup = async (event) => {
    event.preventDefault();
    var agreement_address = this.agreement_address_input.current.value;

    const { lease_agreement_spec } = this.state;

    try {
      let lease_agreement = await lease_agreement_spec.at(agreement_address);

      this.setState({ 
        lease_agreement,
        lease_agreement_address: agreement_address,
      });    
      this.refreshLeaseAgreementInfo(lease_agreement);

    } catch (error) {
      this.setState({agreement_lookup_error: error.message})
    }
  }

  handleLeaseRequest = async (event) => {
    event.preventDefault();

    const { accounts, the_car, lease_agreement_spec } = this.state;
    const account = accounts[0];

    // December 3, 2018 12:00:00 PM
    var start_timestamp = 1543838400;
    // December 9, 2018 11:59:59 AM
    var end_timestamp = 1544356799;

    if (!the_car) {
      this.setState({agreement_request_error: "Select a car!"});
      return;
    }
    const tx = await the_car.requestContractDraft(start_timestamp, end_timestamp, { from: account });
    console.log(tx);
    let lease_agreement_address = tx.logs[0].args.contractAddress;

    let lease_agreement = await lease_agreement_spec.at(lease_agreement_address);

    this.setState({ 
      lease_agreement,
      lease_agreement_address,
     });
     this.refreshLeaseAgreementInfo(lease_agreement);
  }

  async refreshLeaseAgreementInfo(lease_agreement) {
    let lease_start_timestamp = await lease_agreement.start_timestamp();
    let lease_end_timestamp = await lease_agreement.end_timestamp();
    let lease_driver = await lease_agreement.the_driver();

    let driver_deposit_required = await lease_agreement.driver_deposit_required();
    let driver_deposit_amount = await lease_agreement.driver_deposit_amount();
    let owner_deposit_required = await lease_agreement.owner_deposit_required();
    let owner_deposit_amount = await lease_agreement.owner_deposit_amount();
    let driver_balance = await lease_agreement.driver_balance();

    this.setState({ 
      lease_start_timestamp: ts_to_str(lease_start_timestamp),
      lease_end_timestamp: ts_to_str(lease_end_timestamp),
      lease_driver,
      driver_deposit_required: weiToEther(driver_deposit_required),
      driver_deposit_amount: weiToEther(driver_deposit_amount),
      owner_deposit_required: weiToEther(owner_deposit_required),
      owner_deposit_amount: weiToEther(owner_deposit_amount),
      driver_balance: weiToEther(driver_balance),
    });

  }

  handleDepositSubmit = async (event) => {
    event.preventDefault();

    const { accounts, lease_agreement, driver_deposit_required } = this.state;
    const account = accounts[0];

    const amt_wei = web3.utils.toWei('' + driver_deposit_required);
    const tx = await lease_agreement
      .driverSign({from: account, value: amt_wei});
    console.log(tx);

    let driver_deposit_amount = await lease_agreement.driver_deposit_amount();
    let driver_balance = await lease_agreement.driver_balance();

    this.setState({
      driver_deposit_amount: weiToEther(driver_deposit_amount),
      driver_balance: weiToEther(driver_balance),
    });
    
  }

  render() {
    let car_address = this.state.the_car ? this.state.the_car.address : "";
    let car_lookup_error_text;
    if (this.state.car_lookup_error) {
      car_lookup_error_text = <small id="carLookupError" 
        className="form-text alert alert-warning">
        {this.state.car_lookup_error}</small>
    }

    let agreement_request_error_text;
    if (this.state.agreement_request_error) {
      agreement_request_error_text = <small id="agreementRequestError" 
        className="form-text alert alert-warning">
        {this.state.agreement_request_error}</small>
    }

    let agreement_lookup_error_text;
    if (this.state.agreement_lookup_error) {
      agreement_lookup_error_text = <small id="agreementLookupError" 
        className="form-text alert alert-warning">
        {this.state.agreement_lookup_error}</small>
    }

    let account = this.state.accounts[0];
    let is_driver_or_owner;
    if (this.state.lease_agreement) {
      if (account == this.state.lease_driver) {
        is_driver_or_owner = "The Driver";
      } else if (account ==  this.state.car_owner) {
        is_driver_or_owner = "The Car Owner";
      } else {
        is_driver_or_owner = "Not Owner or Driver!";
      }
    }

    return (
    <div className="card">
      <div className="card-body">
        <form onSubmit={this.handleCarLookup}>
          <label>
            LeasableCar Contract address:
            <input id="car_address" name="car_address" type="text" ref={this.car_address_input} />
          </label>
          {car_lookup_error_text}
          <input type="submit" value="Find it!" />
        </form>

        <ul>
          <li>Address: {car_address}</li>
          <li>VIN: {this.state.car_vin}</li>
          <li>Owner: {this.state.car_owner}</li>
          <li>Daily Rate: {this.state.car_daily_rate}</li>
        </ul>

        <form onSubmit={this.handleLeaseRequest}>
          <button type="submit" className="btn btn-primary btn-sm">Request Draft</button>
          {agreement_request_error_text}
        </form>

        <form onSubmit={this.handleAgreementLookup}>
          <label>
            Agreement address:
            <input id="agreement_address" name="agreement_address" type="text" ref={this.agreement_address_input} />
          </label>
          {agreement_lookup_error_text}
          <input type="submit" value="Find it!" />
        </form>

        <ul>
          <li>Draft contract: {this.state.lease_agreement_address}</li>
          <li>Start: {this.state.lease_start_timestamp}</li>
          <li>End: {this.state.lease_end_timestamp}</li>
          <li>Driver: {this.state.lease_driver}</li>
          <li>You are: {is_driver_or_owner}</li>
          <li>Driver deposit required: {this.state.driver_deposit_required} eth</li>
          <li>Driver deposit received: {this.state.driver_deposit_amount} eth</li>
          <li>Owner deposit required: {this.state.owner_deposit_required} eth</li>
          <li>Owner deposit received: {this.state.owner_deposit_amount} eth</li>
          <li>Driver balance: {this.state.driver_balance} eth</li>
        </ul>

        <form onSubmit={this.handleDepositSubmit}>
          <button type="submit" className="btn btn-primary btn-sm">Sign Agreement with Deposit</button>
        </form>

      </div>
    </div>
    );
  }
}