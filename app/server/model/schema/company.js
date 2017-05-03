'use strict';

/**
 * ButtressJS - Realtime datastore for business software
 *
 * @file company.js
 * @description Company model definition.
 * @module Model
 * @exports model, schema, constants
 * @author Chris Bates-Keegan
 *
 */

const mongoose = require('mongoose');
const Model = require('../');
const Logging = require('../../logging');
const Shared = require('../shared');
// const humanname = require('humanname');
// const addressit = require('addressit');

const schema = new mongoose.Schema();
let ModelDef = null;
const constants = {};

/* ********************************************************************************
 *
 * EMBEDDED DEPENDENCIES
 *
 **********************************************************************************/

Model.initModel('Location');
Model.initModel('Contact');

/* ********************************************************************************
 *
 * CONSTANTS
 *
 **********************************************************************************/
const types = [
  'prospect',
  'client',
  'supplier'
];

constants.Type = {
  PROSPECT: types[0],
  CLIENT: types[1],
  SUPPLIER: types[2]
};

const employeeBands = [
  '1-4',
  '5-9',
  '10-19',
  '20-99',
  '100-499',
  '500-999',
  '1000-1999',
  '2000-4999',
  '5000-10000',
  '>10000'
];
constants.EmployeeBands = {
  BAND_1: employeeBands[0],
  BAND_2: employeeBands[1],
  BAND_3: employeeBands[2],
  BAND_4: employeeBands[3],
  BAND_5: employeeBands[4],
  BAND_6: employeeBands[5],
  BAND_7: employeeBands[6],
  BAND_8: employeeBands[7],
  BAND_9: employeeBands[8],
  BAND_10: employeeBands[9]
};

const turnoverBands = [
  '0-99k',
  '100k-199k',
  '200k-299k',
  '300k-499k',
  '500k-999k',
  '1m-4.99m',
  '5m-10m',
  '>10m'
];
constants.TurnoverBands = {
  BAND_1: turnoverBands[0],
  BAND_2: turnoverBands[1],
  BAND_3: turnoverBands[2],
  BAND_4: turnoverBands[3],
  BAND_5: turnoverBands[4],
  BAND_6: turnoverBands[5],
  BAND_7: turnoverBands[6],
  BAND_8: turnoverBands[7]
};

/* ********************************************************************************
 *
 * SCHEMA
 *
 **********************************************************************************/
schema.add({
  _parent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company'
  },
  companyType: {
    type: String,
    enum: types,
    default: constants.Type.PROSPECT
  },
  name: String,
  siccode: Number,
  reference: String,
  description: String,
  source: String,
  companyNumber: Number,
  numEmployees: Number,
  employeeBand: {
    type: String,
    enum: employeeBands
  },
  annualTurnover: Number,
  profitPreTax: Number,
  financeAnnualEndDate: Date,
  netWorth: Number,
  turnoverBand: {
    type: String,
    enum: turnoverBands
  },
  vatExempt: Boolean,
  vatRegistrationNumber: String,
  sector: String,
  subsector: String,
  memberships: String,
  flags: String,
  website: String,
  socialMedia: [{
    type: String,
    url: String
  }],
  primaryLocation: String,
  locations: [{
    name: String,
    address: String,
    city: String,
    county: String,
    region: String,
    postCode: String,
    phoneNumber: String
  }],
  primaryContact: String,
  contacts: [{
    name: String,
    role: String,
    responsibility: String,
    email: String,
    mobile: String,
    directDial: String,
    linkedInProfile: String,
    twitterProfile: String
  }],
  emailHistory: [{
    sent: Boolean,
    received: Boolean,
    timestamp: Date,
    emailId: String,
    threadId: String,
    to: [String],
    from: String,
    subject: String,
    snippet: String
  }],
  contractIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contract'
  }],
  _app: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Application'
  },
  metadata: [{key: String, value: String}],
  notes: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    text: String,
    timestamp: {
      type: Date,
      default: Date.create
    }
  }]
});

/* ********************************************************************************
 *
 * SCHEMA STATIC METHODS
 *
 **********************************************************************************/
/**
 * @param {Object} body - body passed through from a POST request to be validated
 * @return {Object} - returns an object with validation context
 */
const __doValidation = body => {
  let res = {
    isValid: true,
    missing: [],
    invalid: []
  };

  if (!body.name) {
    res.isValid = false;
    res.missing.push('name');
  }
  if (body.companyType && !types.indexOf(body.companyType) === -1) {
    res.isValid = false;
    res.invalid.push('companyType');
  }
  if (!body.location) {
    res.isValid = false;
    res.missing.push('location');
  }
  if (!body.location.name) {
    res.isValid = false;
    res.missing.push('location.name');
  }
  if (!body.location.address) {
    res.isValid = false;
    res.missing.push('location.address');
  }
  if (!body.location.postCode) {
    res.isValid = false;
    res.missing.push('location.postCode');
  }
  // if (!body.location.phoneNumber) {
  //   res.isValid = false;
  //   res.missing.push('location.phoneNumber');
  // }
  if (!body.contact) {
    res.isValid = false;
    res.missing.push('contact');
  }
  if (!body.contact.name) {
    res.isValid = false;
    res.missing.push('contact.name');
  }
  if (!body.contact.role) {
    res.isValid = false;
    res.missing.push('contact.role');
  }

  return res;
};

schema.statics.validate = body => {
  if (body instanceof Array === false) {
    body = [body];
  }
  let validation = body.map(__doValidation).filter(v => v.isValid === false);

  return validation.length >= 1 ? validation[0] : {isValid: true};
};

/*
 * @param {Object} body - body passed through from a POST request
 * @return {Promise} - returns a promise that is fulfilled when the database request is completed
 */
const __addCompany = body => {
  return prev => {
    // Logging.logDebug(body);
    // const loc = new Model.Location({
    //   name: body.location.name,
    //   address: Model.Address.create(body.location.address),
    //   phoneNumber: body.location.phoneNumber
    // });

    // Logging.logDebug(loc.address.details);

    // const contact = Model.Contact.create(body.contact);

    const company = new ModelDef({
      name: body.name,
      companyType: body.companyType,
      siccode: body.siccode,
      reference: body.reference,
      description: body.description,
      source: body.source,
      flags: body.flags,
      memberships: body.memberships,
      companyNumber: body.number ? body.number : body.companyNumber,
      numEmployees: body.numEmployees,
      employeeBand: body.employeeBand,
      annualTurnover: body.annualTurnover,
      turnoverBand: body.turnoverBand,
      profitPreTax: body.profitPreTax,
      netWorth: body.netWorth,
      financeAnnualEndDate: body.financeAnnualEndDate,
      vatExempt: body.vatExempt,
      vatRegistrationNumber: body.vatRegistrationNumber,
      sector: body.sector,
      subsector: body.subsector,
      website: body.website,
      locations: [body.location],
      contacts: [body.contact],
      _app: Model.authApp._id
    });

    company.primaryContact = company.contacts[0]._id;
    company.primaryLocation = company.locations[0]._id;

    return Promise.resolve(prev.concat([company.toObject()]));
  };
};

schema.statics.add = body => {
  if (body instanceof Array === false) {
    body = [body];
  }

  return body.reduce((promise, item) => {
    return promise
      .then(__addCompany(item))
      .catch(Logging.Promise.logError());
  }, Promise.resolve([]))
  .then(companies => {
    return new Promise((resolve, reject) => {
      ModelDef.collection.insert(companies, (err, res) => {
        if (err) {
          reject(err);
          return;
        }

        resolve(res.ops.map(c => c._id));
      });
    });
  });
};

/* ********************************************************************************
 *
 * SCHEMA VIRTUAL METHODS
 *
 *********************************************************************************/

schema.virtual('details').get(function() {
  // Logging.logDebug(this.locations[this.primaryLocation].details);

  const _locations = this.locations.map(l => {
    // const _address = addressit(l.address, {locale: 'en-GB'});
    // const regions = _address.regions;
    Logging.log(l.address, Logging.Constants.LogLevel.SILLY);
    // Logging.log(_address, Logging.Constants.LogLevel.DEBUG);
    return {
      id: l._id,
      name: l.name,
      tag: '',
      address: l.address,
      city: l.city,
      county: l.county,
      postCode: l.postCode,
      phoneNumber: l.phoneNumber
      // address: {
      //   full: l.address,
      //   unit: _address.unit,
      //   number: _address.number,
      //   street: _address.street,
      //   town: regions.length >= 2 ? regions.shift() : '',
      //   city: regions.length >= 1 ? regions.shift() : '',
      //   county: _address.state,
      //   postcode: _address.postalcode
      // }
    };
  });

  const _contacts = this.contacts.map(c => {
    // const name = humanname.parse(c.name);
    // const formalName =
    //   `${name.title ? name.title + ' ' : ''}${name.firstName} ${name.initials ? name.initials + ' ' : ''}${name.lastName}`;
    return {
      // name: {
      //   full: c.name,
      //   formal: formalName,
      //   title: name.title,
      //   forename: name.firstName,
      //   initials: name.initials,
      //   surname: name.lastName,
      //   suffix: name.suffix
      // },
      id: c._id,
      name: c.name,
      tag: '',
      role: c.role,
      email: c.email,
      directDial: c.directDial,
      mobile: c.mobile
    };
  });
  return {
    id: this._id,
    name: this.name,
    companyType: this.companyType,
    description: this.description,
    siccode: this.siccode,
    reference: this.reference,
    source: this.source,
    memberships: this.memberships,
    flags: this.flags,
    companyNumber: this.companyNumber,
    numEmployees: this.numEmployees,
    employeeBand: this.employeeBand,
    annualTurnover: this.annualTurnover,
    turnoverBand: this.turnoverBand,
    profitPreTax: this.profitPreTax,
    netWorth: this.netWorth,
    financeAnnualEndDate: this.financeAnnualEndDate,
    vatExempt: this.vatExempt,
    vatRegistrationNumber: this.vatRegistrationNumber,
    sector: this.sector,
    subsector: this.subsector,
    locations: _locations,
    contacts: _contacts,
    contractIds: this.contractIds,
    primaryLocation: this.primaryLocation,
    primaryContact: this.primaryContact,
    website: this.website,
    emailHistory: this.emailHistory,
    notes: this.notes.map(n => ({text: n.text, timestamp: n.timestamp, userId: n.userId}))
  };
});

/* ********************************************************************************
 *
 * SCHEMA METHODS
 *
 **********************************************************************************/

/* ********************************************************************************
 *
 * UPDATE BY PATH
 *
 **********************************************************************************/

const PATH_CONTEXT = {
  '^(name|companyType|reference|description|siccode|numEmployees|annualTurnover|profitPreTax|financeEndDate|netWorth|source|memberships|flags|vatExempt|vatRegistrationNumber|companyNumber)$': {type: 'scalar', values: []}, // eslint-disable-line max-len
  '^notes$': {type: 'vector-add', values: []},
  '^notes.([0-9]{1,3})$': {type: 'scalar', values: []},
  '^notes.([0-9]{1,3}).__remove__$': {type: 'vector-rm', values: []},
  '^notes.([0-9]{1,3}).text$': {type: 'scalar', values: []},
  '^emailHistory$': {type: 'vector-add', values: []},
  '^emailHistory.([0-9]{1,3}).(__remove__)$': {type: 'vector-rm', values: []},
  '^contractIds$': {type: 'vector-add', values: []},
  '^contractIds.([0-9]{1,3})$': {type: 'scalar', values: []},
  '^contractIds.([0-9]{1,3}).(__remove__)$': {type: 'vector-rm', values: []},
  '^contacts$': {type: 'vector-add', values: []},
  '^contacts.([0-9]{1,3})$': {type: 'scalar', values: []},
  '^contacts.([0-9]{1,3}).(__remove__)$': {type: 'vector-rm', values: []},
  '^contacts.([0-9]{1,3}).(email|tag|directDial|mobile|role|name|linkedInProfile|twitterProfile)$': {type: 'scalar', values: []},
  '^locations$': {type: 'vector-add', values: []},
  '^locations.([0-9]{1,3})$': {type: 'scalar', values: []},
  '^locations.([0-9]{1,3}).(__remove__)$': {type: 'vector-rm', values: []},
  '^locations.([0-9]{1,3}).(name|tag|phoneNumber|address|county|city|postCode)$': {type: 'scalar', values: []}
};

schema.statics.validateUpdate = Shared.validateUpdate(PATH_CONTEXT);
schema.methods.updateByPath = Shared.updateByPath(PATH_CONTEXT);

/* ********************************************************************************
 *
 * SCHEMA DB FUNCTIONS
 *
 **********************************************************************************/

/*
 * @return {Promise} - returns a promise that is fulfilled when the database request is completed
 */
schema.statics.isDuplicate = details => {
  return Promise.resolve(false);
};

/**
 * @param {App} company - Company object to be deleted
 * @return {Promise} - returns a promise that is fulfilled when the database request is completed
 */
schema.statics.rm = company => {
  Logging.log(`DELETING: ${company._id}`, Logging.Constants.LogLevel.DEBUG);
  // Logging.log(org.details, Logging.Constants.LogLevel.VERBOSE);
  return ModelDef.remove({_id: company._id});
};

/**
 * @param {Array} ids - Array of company ids to delete
 * @return {Promise} - returns a promise that is fulfilled when the database request is completed
 */
schema.statics.rmBulk = ids => {
  Logging.log(`DELETING: ${ids}`, Logging.Constants.LogLevel.SILLY);
  return ModelDef.remove({_id: {$in: ids}}).exec();
};

/*
 * @return {Promise} - returns a promise that is fulfilled when the database request is completed
 */
schema.statics.rmAll = () => {
  return ModelDef.remove({});
};

/**
 * @return {Promise} - resolves to an array of Companies
 */
schema.statics.findAll = () => {
  Logging.log(`findAll: ${Model.authApp._id}`, Logging.Constants.LogLevel.DEBUG);

  if (Model.token.authLevel === Model.Constants.Token.AuthLevel.SUPER) {
    return ModelDef.find({});
  }

  return ModelDef.find({_app: Model.authApp._id});
};

/**
 * @param {Array} ids - Array of company ids to get
 * @return {Promise} - resolves to an array of Companies
 */
schema.statics.findAllById = ids => {
  Logging.log(`findAllById: ${Model.authApp._id}`, Logging.Constants.LogLevel.INFO);

  return ModelDef.find({_id: {$in: ids}, _app: Model.authApp._id});
};

/* ********************************************************************************
 *
 * METADATA
 *
 **********************************************************************************/

schema.methods.addOrUpdateMetadata = Shared.addOrUpdateMetadata;
schema.methods.findMetadata = Shared.findMetadata;
schema.methods.rmMetadata = Shared.rmMetadata;

/* ********************************************************************************
 *
 * EXPORTS
 *
 **********************************************************************************/
ModelDef = mongoose.model('Company', schema);

module.exports.constants = constants;
module.exports.schema = schema;
module.exports.model = ModelDef;
