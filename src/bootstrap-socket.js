'use strict';

/**
 * ButtressJS - Realtime datastore for software
 *
 * @file bootstrap-socket.js
 * @description Bootstrap the socket app
 * @module Model
 * @author Chris Bates-Keegan
 *
 */
const os = require('os');
const cluster = require('cluster');
const net = require('net');
const Express = require('express');
const {createClient} = require('redis');

const sio = require('socket.io');
const sioClient = require('socket.io-client');
const redisAdapter = require('@socket.io/redis-adapter');
const {Emitter} = require('@socket.io/redis-emitter');

const MongoClient = require('mongodb').MongoClient;
const ObjectId = require('mongodb').ObjectId;

const NRP = require('node-redis-pubsub');

const Config = require('node-env-obj')();

const Model = require('./model');
const Logging = require('./logging');

class BootstrapSocket {
	constructor() {
		Logging.setLogLevel(Logging.Constants.LogLevel.INFO);

		this.processes = os.cpus().length;
		this.processes = 1;
		this.workers = [];

		this.__apps = [];
		this.__namespace = {};

		this._dataShareSockets = {};

		this.__superApps = [];

		this.isPrimary = Config.sio.app === 'primary';

		this.emitter = null;

		let socketInitTask = null;
		if (cluster.isMaster) {
			socketInitTask = (db) => this.__initMaster(db);
		} else {
			socketInitTask = (db) => this.__initWorker(db);
		}

		return this.__nativeMongoConnect()
			.then(socketInitTask)
			.then(() => cluster.isMaster);
	}

	async __initMaster(db) {
		const nrp = new NRP(Config.redis);

		const redisClient = createClient(Config.redis);
		this.emitter = new Emitter(redisClient);

		if (this.isPrimary) {
			Logging.logDebug(`Primary Master`);
			nrp.on('activity', (data) => this.__onActivity(data));
		}

		await this.__initMongoConnect();

		const apps = await Model.App.findAll();

		this.__namespace['stats'] = {
			emitter: this.emitter.of(`/stats`),
			sequence: {
				super: 0,
				global: 0,
			},
		};

		// Spawn worker processes, pass through build app objects
		while (await apps.hasNext()) {
			const app = await apps.next();
			if (!app._token) return Logging.logWarn(`App with no token`);

			await this.__createAppNamespace(app);
		}

		this.__spawnWorkers({
			apps: this.__apps,
		});
	}

	async __initWorker() {
		const app = new Express();
		const server = app.listen(0, 'localhost');
		const io = sio(server, {
			// Allow connections from sio 2 clients
			// https://socket.io/docs/v3/migrating-from-2-x-to-3-0/#How-to-upgrade-an-existing-production-deployment
			allowEIO3: true,
			// https://expressjs.com/en/resources/middleware/cors.html#configuration-options
			// set origin to true to reflect the request origin, as defined by req.header('Origin'), or set it to false to disable CORS.
			cors: {
				origin: true,
				credentials: true,
			},
		});

		await this.__initMongoConnect();

		// As of v7, the library will no longer create Redis clients on behalf of the user.
		const redisClient = createClient(Config.redis);
		io.adapter(redisAdapter(redisClient, redisClient.duplicate()));

		const stats = io.of(`/stats`);
		stats.on('connect', (socket) => {
			Logging.logSilly(`${socket.id} Connected on /stats`);
			socket.on('disconnect', () => {
				Logging.logSilly(`${socket.id} Disconnect on /stats`);
			});
		});

		Logging.logSilly(`Listening on app namespaces`);
		io.of(/^\/[a-z\d-]+$/i).use(async (socket, next) => {
			const apiPath = socket.nsp.name.substring(1);
			const rawToken = socket.handshake.query.token;

			Logging.logDebug(`Fetching token with value: ${rawToken}`);
			const token = await Model.Token.findOne({value: rawToken});
			if (!token) {
				Logging.logWarn(`Invalid token, closing connection: ${socket.id}`);
				return next('invalid-token');
			}

			Logging.logDebug(`Fetching app with apiPath: ${apiPath}`);
			const app = await Model.App.findOne({apiPath: apiPath});
			if (!app) {
				Logging.logWarn(`Invalid app, closing connection: ${socket.id}`);
				return next('invalid-app');
			}

			if (token.type === 'dataSharing') {
				Logging.logDebug(`Fetching data share with tokenId: ${token._id}`);
				const dataShare = await Model.AppDataSharing.findOne({_tokenId: new ObjectId(token._id)});
				if (!dataShare) {
					Logging.logWarn(`Invalid data share, closing connection: ${socket.id}`);
					return next('invalid-app');
				}

				socket.join(dataShare.name);
			} else if (token.role) {
				socket.join(token.role);
				Logging.log(`[${apiPath}][${token.role}] Connected ${socket.id}`);
			} else {
				Logging.log(`[${apiPath}][Global] Connected ${socket.id}`);
			}

			socket.on('disconnect', () => {
				Logging.logSilly(`[${apiPath}] Disconnect ${socket.id}`);
			});

			next();
		});

		// Open up data sharing connections
		Logging.logSilly(`Setting up data sharing connections`);
		await Model.AppDataSharing.find({
			active: true,
		})
			.forEach((dataShare) => {
				const url = `${dataShare.remoteApp.endpoint}/${dataShare.remoteApp.apiPath}`;
				Logging.logSilly(`Attempting to connect to ${url}`);
				this._dataShareSockets[dataShare.name] = sioClient(url, {
					query: {
						token: dataShare.remoteApp.token,
					},
					rejectUnauthorized: false,
				});
				this._dataShareSockets[dataShare.name].on('connect', () => {
					Logging.logSilly(`Connected to ${url}`);
				});
				this._dataShareSockets[dataShare.name].on('disconnect', () => {
					Logging.logSilly(`Disconnected from ${url}`);
				});
			});

		process.on('message', (message, input) => {
			if (message === 'buttress:connection') {
				const connection = input;
				server.emit('connection', connection);
				connection.resume();
				return;
			}
		});

		Logging.logSilly(`Worker ready`);
		process.send('workerInitiated');
	}

	__onActivity(data) {
		const apiPath = data.appAPIPath;

		if (!this.emitter) {
			throw new Error('SIO Emitter isn\'t defined');
		}

		this.__namespace['stats'].emitter.emit('activity', 1);

		Logging.logSilly(`[${apiPath}][${data.role}][${data.verb}] ${data.path}`);

		// Super apps?
		if (data.isSuper) {
			this.__superApps.forEach((superApiPath) => {
				this.__namespace[superApiPath].sequence['super']++;
				this.__namespace[superApiPath].emitter.emit('db-activity', {
					data: data,
					sequence: this.__namespace[superApiPath].sequence['super'],
				});
				Logging.logDebug(`[${superApiPath}][super][${data.verb}] ${data.path}`);
			});
			return;
		}

		// Disable broadcasting to public space
		if (data.broadcast === false) {
			Logging.logDebug(`[${apiPath}][${data.role}][${data.verb}] ${data.path} - Early out as it isn't public.`);
			return;
		}

		// Broadcast on requested channel
		if (!this.__namespace[apiPath]) {
			// Init the namespace
			// throw new Error('Trying to access namespace that doesn\'t exist');
			this.__namespace[apiPath] = {
				emitter: this.emitter.of(`/${apiPath}`),
				sequence: {
					super: 0,
					global: 0,
				},
			};
		}

		if (data.role) {
			if (!this.__namespace[apiPath].sequence[data.role]) {
				this.__namespace[apiPath].sequence[data.role] = 0;
			}
			Logging.logDebug(`[${apiPath}][${data.role}][${data.verb}] ${data.path}`);
			this.__namespace[apiPath].sequence[data.role]++;
			this.__namespace[apiPath].emitter.in(data.role).emit('db-activity', {
				data: data,
				sequence: this.__namespace[apiPath].sequence[data.role],
			});
		} else {
			Logging.logDebug(`[${apiPath}][global]: [${data.verb}] ${data.path}`);
			this.__namespace[apiPath].sequence.global++;
			this.__namespace[apiPath].emitter.emit('db-activity', {
				data: data,
				sequence: this.__namespace[apiPath].sequence.global,
			});
		}
	}

	__onSchemaUpdate(data) {
		console.log('__onSchemaUpdate', data);
		// Fetch the app and update
	}

	__spawnWorkers() {
		Logging.log(`Spawning ${this.processes} Socket Workers`);

		for (let x = 0; x < this.processes; x++) {
			this.workers[x] = cluster.fork();
			this.workers[x].on('message', (res) => {
				if (res === 'workerInitiated') {
					// this.workers[x].send({'buttress:initAppTokens': appTokens});
				}
			});
		}

		net.createServer({pauseOnConnect: true}, (connection) => {
			const worker = this.workers[this.__indexFromIP(connection.remoteAddress, this.processes)];
			worker.send('buttress:connection', connection);
		}).listen(Config.listenPorts.sock);
	}

	__indexFromIP(ip, spread) {
		let s = '';
		for (let i = 0, _len = ip.length; i < _len; i++) {
			if (!isNaN(ip[i])) {
				s += ip[i];
			}
		}

		return Number(s) % spread;
	}

	async __createAppNamespace(app) {
		if (this.__namespace[app.apiPath]) {
			return Logging.logDebug(`Namespace already created: ${app.name}`);
		}

		const token = await Model.Token.findOne({_id: app._token});
		if (!token) return Logging.logWarn(`No Token found for ${app.name}`);

		const isSuper = token.authLevel > 2;

		this.__namespace[app.apiPath] = {
			emitter: this.emitter.of(`/${app.apiPath}`),
			sequence: {
				super: 0,
				global: 0,
			},
		};

		if (isSuper) {
			this.__superApps.push(app.apiPath);
		}

		Logging.log(`${(isSuper) ? 'SUPER' : 'APP'} Name: ${app.name}, App ID: ${app._id}, Path: /${app.apiPath}`);
	}

	async __nativeMongoConnect() {
		const dbName = `${Config.app.code}-${Config.env}`;
		const mongoUrl = `mongodb://${Config.mongoDb.url}`;
		Logging.logDebug(`Attempting connection to ${mongoUrl}`);

		const client = await MongoClient.connect(mongoUrl, Config.mongoDb.options);

		return await client.db(dbName);
	}

	async __initMongoConnect() {
		const db = await this.__nativeMongoConnect();
		await Model.init(db);
		return db;
	}
}

module.exports = BootstrapSocket;
