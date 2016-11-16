'use strict';

/**
 * Rhizome - The API that feeds grassroots movements
 *
 * @file index.js
 * @description Model management
 * @module Routes
 * @author Chris Bates-Keegan
 *
 */

const fs = require('fs');
const path = require('path');
const Route = require('./route');
const Logging = require('../logging');
const Helpers = require('../helpers');
const Model = require('../model');

/**
 * @param {Object} app - express app object
 * @param {Object} Route - route object
 * @private
 */
function _initRoute(app, Route) {
  var route = new Route();
  app[route.verb](`/api/v1/${route.path}`, (req, res) => {
    route
      .exec(req, res)
      .then(result => res.json(result))
      .catch(err => {
        Logging.log(err, Logging.Constants.LogLevel.ERR);
        res.status(err.statusCode ? err.statusCode : 500).json({message: err.message});
      });
  });
}

var _tokens = [];

/**
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - next handler function
 * @private
 */
function _authenticateToken(req, res, next) {
  Logging.log(`Token: ${req.query.token}`, Logging.Constants.LogLevel.VERBOSE);
  if (!req.query.token) {
    Logging.log('EAUTH: Missing Token', Logging.Constants.LogLevel.ERR);
    res.sendStatus(400);
    return;
  }
  _getToken(req.query.token)
  .then(token => {
    if (token === null) {
      Logging.log('EAUTH: Invalid Token', Logging.Constants.LogLevel.ERR);
      res.sendStatus(401);
      return;
    }
    Model.token = req.token = token.details;
    Model.authApp = req.authApp = token._app;
    Model.authUser = req.authUser = token._user;

    token.uses.push(new Date());
    token.save()
    .then(Helpers.Promise.inject())
    .then(next);
  })
  .catch(Logging.Promise.logError());
}

/**
 * @param  {String} tokenValue - token
 * @return {Promise} - resolves with the matching token if any
 */
function _getToken(tokenValue) {
  let token = null;

  if (_tokens.length > 0) {
    // Logging.log("Using Cached Tokens", Logging.Constants.LogLevel.DEBUG);
    return Promise.resolve(_lookupToken(_tokens, tokenValue));
  }

  return new Promise((resolve, reject) => {
    Model.Token.findAllNative()
    .then(Logging.Promise.logArray("Tokens: ", Logging.Constants.LogLevel.SILLY))
    .then(tokens => {
      _tokens = tokens;
      token = _lookupToken(_tokens, tokenValue);
      return resolve(token);
    });
  });
}

/**
 * @param {array} tokens - cached tokens
 * @param {string} value - token string to look for
 * @return {*} - false if not found, Token (native) if found
 * @private
 */
function _lookupToken(tokens, value) {
  let token = tokens.filter(t => t.value === value);
  return token.length === 0 ? null : token[0];
}

/**
 *
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - next handler function
 * @private
 */
function _configCrossDomain(req, res, next) {
  if (req.authApp.type !== Model.Constants.App.Type.BROWSER && !req.authUser) {
    next();
    return;
  }
  Logging.log(req.header('Origin'));

  res.header('Access-Control-Allow-Origin', `http://${req.app.domain}`);
  res.header('Access-Control-Allow-Methods', 'POST,OPTIONS');

  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
}

/**
 *
 * @param {Object} app - express app object
 */
exports.init = app => {
  Route.app = app;

  app.get('/favicon.ico', (req, res, next) => res.sendStatus(404));
  app.get('/index.html', (req, res, next) => res.send('<html><head><title>Rhizome</title></head></html>'));

  app.use(_authenticateToken);
  app.use(_configCrossDomain);

  var providers = _getRouteProviders();
  for (var x = 0; x < providers.length; x++) {
    var routes = providers[x];
    for (var y = 0; y < routes.length; y++) {
      var route = routes[y];
      _initRoute(app, route);
    }
  }
};

/**
 * @return {Array} - returns an array of Route handlers
 * @private
 */
function _getRouteProviders() {
  var filenames = fs.readdirSync(`${__dirname}/api`);

  var files = [];
  for (var x = 0; x < filenames.length; x++) {
    var file = filenames[x];
    if (path.extname(file) === '.js') {
      files.push(require(`./api/${path.basename(file, '.js')}`));
    }
  }

  return files;
}
