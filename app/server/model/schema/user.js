'use strict';

/**
 * ButtressJS - Realtime datastore for business software
 *
 * @file user.js
 * @description User model definition.
 * @module Model
 * @exports model, schema, constants
 * @author Chris Bates-Keegan
 *
 */

const SchemaModel = require('../schemaModel');
const Model = require('../');
const Logging = require('../../logging');
// const Shared = require('../shared');
const ObjectId = require('mongodb').ObjectId;

const collectionName = 'users';
const collection = Model.mongoDb.collection(collectionName);

/**
 * Constants
*/
const apps = ['google', 'facebook', 'twitter', 'linkedin'];
const App = {
  GOOGLE: apps[0],
  FACEBOOK: apps[1],
  TWITTER: apps[2],
  LINKEDIN: apps[3]
};

class UserSchemaModel extends SchemaModel {
  constructor(MongoDb) {
    let schema = UserSchemaModel.Schema;
    super(MongoDb, schema);
  }

  static get Constants() {
    return {
      App: App
    };
  }
  get Constants() {
    return UserSchemaModel.Constants;
  }

  static get Schema() {
    return {
      name: "users",
      type: "collection",
      collection: "users",
      extends: [],
      properties: {
        username: {
          __type: "string",
          __default: "",
          __allowUpdate: true
        },
        orgRole: {
          __type: "string",
          __default: "",
          __allowUpdate: true
        },
        teamName: {
          __type: "string",
          __default: "",
          __allowUpdate: true
        },
        teamRole: {
          __type: "string",
          __default: "",
          __allowUpdate: true
        },
        auth: {
          __type: "array",
          __required: true,
          __allowUpdate: true,
          __schema: {
            app: {
              __type: "string",
              __default: "",
              __allowUpdate: true
            },
            appId: {
              __type: "string",
              __default: "",
              __allowUpdate: true
            },
            username: {
              __type: "string",
              __default: "",
              __allowUpdate: true
            },
            profileUrl: {
              __type: "string",
              __default: "",
              __allowUpdate: true
            },
            images: {
              profile: {
                __type: "string",
                __default: "",
                __allowUpdate: true
              },
              banner: {
                __type: "string",
                __default: "",
                __allowUpdate: true
              }
            },
            email: {
              __type: "string",
              __default: "",
              __allowUpdate: true
            },
            locale: {
              __type: "string",
              __default: "",
              __allowUpdate: true
            },
            token: {
              __type: "string",
              __default: "",
              __allowUpdate: true
            },
            tokenSecret: {
              __type: "string",
              __default: "",
              __allowUpdate: true
            },
            refreshToken: {
              __type: "string",
              __default: "",
              __allowUpdate: true
            },
            extras: {
              __type: "string",
              __default: "",
              __allowUpdate: true
            }
          }
        },
        _apps: {
          __type: "array",
          __required: true,
          __allowUpdate: true
        },
        _person: {
          __type: "id",
          __required: true,
          __allowUpdate: false
        },
        _tokens: {
          __type: "array",
          __required: true,
          __allowUpdate: true
        }
      }
    };
  }

  /**
   * @param {Object} body - body passed through from a POST request
   * @param {Object} person - person object to which the user is attached
   * @param {Object} auth - OPTIONAL authentication details for a user token
   * @return {Promise} - returns a promise that is fulfilled when the database request is completed
   */
  add(body, person, auth) {
    const user = {
      auth: [{
        app: body.app,
        appId: body.id,
        username: body.username,
        profileUrl: body.profileUrl,
        images: {
          profile: body.profileImgUrl,
          banner: body.bannerImgUrl
        },
        email: body.email,
        token: body.token,
        tokenSecret: body.tokenSecret
      }],
      orgRole: body.orgRole,
      teamName: body.teamName,
      teamRole: body.teamRole
    };

    Logging.logDebug(person.name);
    Logging.logDebug(user.auth[0].app);
    Logging.logDebug(user.auth[0].appId);

    let _user = null;
    return super.add(user, {
      _apps: [Model.authApp._id],
      _person: person.id
    })
    .then(user => {
      _user = user;
      if (!auth) {
        return false;
      }

      auth.allocated = true;

      return Model.Token.add(auth, {
        _app: Model.authApp._id,
        _user: _user._id
      });
    })
    .then(token => {
      if (token) {
        _user.authToken = token.value;
      } else {
        _user.authToken = false;
      }

      return _user;
    });
  }

  addAuth(auth) {
    Logging.log(`addAuth: ${auth.app}`, Logging.Constants.LogLevel.INFO);
    let existing = this.auth.find(a => a.app === auth.app && a.id == auth.id); // eslint-disable-line eqeqeq
    if (existing) {
      Logging.log(`present: ${auth.app}:${auth.id}`, Logging.Constants.LogLevel.DEBUG);
      return Promise.resolve(this);
    }

    Logging.log(`not present: ${auth.app}:${auth.id}`, Logging.Constants.LogLevel.DEBUG);
    this.auth.push(new Model.Appauth({
      app: auth.app,
      appId: auth.id,
      username: auth.username,
      profileUrl: auth.profileUrl,
      images: {
        profile: auth.profileImgUrl,
        banner: auth.bannerImgUrl
      },
      email: auth.email,
      token: auth.token,
      tokenSecret: auth.tokenSecret,
      refreshToken: auth.refreshToken
    }));
    return this.save();
  }

  /**
   * @param {object} user - user object of which the token is being updated
   * @param {object} app - app object of which the token is being updated
   * @param {Object} updated - updated app information passed through from a PUT request
   * @return {Promise} - returns a promise that is fulfilled when the database request is completed
   */
  updateAppInfo(user, app, updated) {
    const authIdx = user.auth.findIndex(a => a.app === app);
    if (authIdx === -1) {
      Logging.log(`Unable to find Appauth for ${app}`, Logging.Constants.LogLevel.DEBUG);
      return Promise.resolve(false);
    }

    const auth = user.auth[authIdx];
    auth.username = updated.username;
    auth.profileUrl = updated.profileUrl;
    auth.images.profile = updated.profileImgUrl;
    auth.images.banner = updated.bannerImgUrl;
    auth.email = updated.email;
    auth.token = updated.token;
    auth.tokenSecret = updated.tokenSecret;
    auth.refreshToken = updated.refreshToken;

    let update = {};
    update[`auth.${authIdx}`] = auth;
    return super.update(update, user._id).then(() => true);
  }

  updateApps(user, app) {
    Logging.log(`updateApps: ${Model.authApp._id}`, Logging.Constants.LogLevel.INFO);
    if (!user._apps) {
      user._apps = [];
    }
    let matches = user._apps.filter(function(a) {
      return a._id === app._id;
    });
    if (matches.length > 0) {
      Logging.log(`present: ${Model.authApp._id}`, Logging.Constants.LogLevel.DEBUG);
      return Promise.resolve();
    }

    Logging.log(`not present: ${Model.authApp._id}`, Logging.Constants.LogLevel.DEBUG);
    user._apps.push(app._id);

    return super.update({
      _apps: user._apps
    }, user.id);
  }

  exists(id) {
    return collection.find({_id: new ObjectId(id)})
      .limit(1)
      .count()
      .then(count => count > 0);
  }

  getPopulated(user) {
    return Model.Person.findById(user._person)
    .then(person => {
      user.person = person;
      return user;
    });
  }

  /**
   * @param {ObjectId} appId - id of the App that owns the user
   * @return {Promise} - resolves to an array of Apps
   */
  findAll() {
    Logging.logSilly(`findAll: ${Model.authApp._id}`);

    if (Model.token.authLevel === Model.Token.Constants.AuthLevel.SUPER) {
      return super.find({});
    }

    return super.find({_apps: Model.authApp._id});
  }

  /**
   * @param {string} username - username to check for
   * @return {Promise} - resolves to a User object or null
   */
  getByUsername(username) {
    return super.findOne({username: username}, {_id: 1});
  }

  /**
   * @param {string} appName - Name of the authenticating App (facebook|twitter|google) that owns the user
   * @param {string} appUserId - AppId of the user
   * @return {Promise} - resolves to an array of Apps
   */
  getByAppId(appName, appUserId) {
    Logging.log(`getByAppId: ${appName} - ${appUserId}`, Logging.Constants.LogLevel.VERBOSE);

    return super.findOne({
      'auth.app': appName,
      'auth.appId': appUserId
    }, {});
  }

  attachToPerson(person, details) {
    if (person !== null) {
      this._person = person;
      return this.save();
    }

    return new Promise((resolve, reject) => {
      Model.Person
        .add(details, Model.authApp._id)
        .then(person => {
          Logging.log(person, Logging.Constants.LogLevel.DEBUG);
          this._person = person.id;
          return this.save();
        })
        .then(resolve, reject);
    });
  }

  /**
   * @param {string} app - name of the app for which the token is being updated
   * @param {Object} body - body passed through from a PUT request
   * @return {Promise} - returns a promise that is fulfilled when the database request is completed
   */
  updateToken(app, body) {
    var auth = this.auth.find(a => a.app === app);
    if (!auth) {
      Logging.log(`Unable to find Appauth for ${app}`, Logging.Constants.LogLevel.DEBUG);
      return Promise.resolve(false);
    }

    Logging.log(`Old Token: ${auth.token}`, Logging.Constants.LogLevel.DEBUG);
    Logging.log(`Old Token Secret: ${auth.tokenSecret}`, Logging.Constants.LogLevel.DEBUG);
    Logging.log(`New Token: ${body.token}`, Logging.Constants.LogLevel.DEBUG);
    Logging.log(`New Token Secret: ${body.tokenSecret}`, Logging.Constants.LogLevel.DEBUG);

    auth.token = body.token;
    auth.tokenSecret = body.tokenSecret;

    return this.save().then(() => true);
  }
}

/**
 * Exports
 */
module.exports = UserSchemaModel;
