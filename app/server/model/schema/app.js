'use strict';

/**
 * Rhizome - The API that feeds grassroots movements
 *
 * @file app.js
 * @description App model definition.
 * @module Model
 * @exports model, schema, constants
 * @author Chris Bates-Keegan
 *
 */

var mongoose = require('mongoose');
var Model = require('../');
var Logging = require('../../logging');

/**
 * Constants
*/

var type = ['server', 'ios', 'android', 'browser'];
var Type = {
  SERVER: type[0],
  IOS: type[1],
  ANDROID: type[2],
  BROWSER: type[3]
};

var authLevel = [0, 1, 2, 3];
var AuthLevel = {
  NONE: 0,
  USER: 1,
  ADMIN: 2,
  SUPER: 3
};

var constants = {
  Type: Type,
  AuthLevel: AuthLevel
};

/**
 * Schema
 */
var schema = new mongoose.Schema({
  name: String,
  type: {
    type: String,
    enum: type
  },
  domain: String,
  authLevel: {
    type: Number,
    enum: authLevel
  },
  permissions: [{route: String, permission: String}],
  _owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group'
  },
  _token: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Token'
  }
});

var ModelDef = null;
Model.initModel('Token');
Model.initModel('Group');

/**
 * Schema Virtual Methods
 */
schema.virtual('details').get(function() {
  return {
    id: this._id,
    name: this.name,
    type: this.type,
    authLevel: this.authLevel,
    owner: this.ownerName,
    token: this.tokenValue,
    permissions: this.permissions.map(p => {
      return {route: p.route, permission: p.permission};
    })
  };
});

schema.virtual('ownerName').get(function() {
  if (!this._owner) {
    return false;
  }
  if (!this._owner.details) {
    return this._owner;
  }
  return this._owner.details;
});

schema.virtual('tokenValue').get(function() {
  if (!this._token) {
    return false;
  }
  if (!this._token.value) {
    return this._token;
  }
  return this._token.value;
});

/**
 * Schema Methods
 */

schema.methods.setOwner = function(group) {
  this._owner = group;
  return this.save();
};

/**
 * Schema Static Methods
 */

/**
 * @param {Object} body - body passed through from a POST request
 * @return {Promise} - fulfilled with App Object when the database request is completed
 */
schema.statics.add = body => {
  Logging.log(body);
  return new Promise((resolve, reject) => {
    var app = new ModelDef({
      name: body.name,
      type: body.type,
      authLevel: body.authLevel,
      permissions: body.permissions,
      domain: body.domain,
      _owner: body.ownerGroupId
    });

    Model.Token.add(Model.Constants.Token.Type.APP)
      .then(token => {
        app._token = token;
        app.save().then(res => resolve(Object.assign(res.details, {token: token.value})), reject);
      });
  });
};

/**
 * @param {App} app - App object to be deleted
 * @return {Promise} - returns a promise that is fulfilled when the database request is completed
 */
schema.statics.rm = app => {
  // Logging.log(app.details);
  return new Promise((resolve, reject) => {
    Model.Token.remove({_id: app._token})
      .then(() => ModelDef.remove({_id: app._id}))
      .then(resolve, reject);
  });
};

/**
 * @return {Promise} - resolves to an array of Apps (App.details)
 */
schema.statics.findAll = () => {
  return new Promise((resolve, reject) => {
    ModelDef.find({}).populate('_token').populate('_owner')
      // .then(Logging.Promise.logArrayProp('App', '_token'))
      .then(res => resolve(res.map(d => Object.assign(d.details, {token: d._token.value}))), reject);
      // .then(Logging.Promise.logArrayProp('tokens', '_token'))
      // .then(res => resolve(res.map(d => d.details)), reject);
  });
};

/**
 * @return {Promise} - resolves to an array of Apps (native Mongoose objects)
 */
schema.statics.findAllNative = () => {
  return new Promise((resolve, reject) => {
    ModelDef.find({}).populate('_token')
      .then(Logging.Promise.logArrayProp('App', '_token', Logging.Constants.LogLevel.VERBOSE))
      .then(resolve, reject);
      // .then(Logging.Promise.logArrayProp('tokens', '_token'))
      // .then(res => resolve(res.map(d => d.details)), reject);
  });
};

ModelDef = mongoose.model('App', schema);

/**
 * Exports
 */
module.exports.constants = constants;
module.exports.schema = schema;
module.exports.model = ModelDef;
