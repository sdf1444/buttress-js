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
const sio = require('socket.io');
const {createClient} = require('redis');
const redisAdapter = require('@socket.io/redis-adapter');
const {Emitter} = require('@socket.io/redis-emitter');

const Config = require('node-env-obj')();
const Model = require('./model');
const Logging = require('./logging');
const MongoClient = require('mongodb').MongoClient;
const ObjectId = require('mongodb').ObjectId;
const NRP = require('node-redis-pubsub');

class BootstrapSocket {
	constructor() {
		Logging.setLogLevel(Logging.Constants.LogLevel.INFO);

		this.processes = os.cpus().length;
		this.processes = 1;
		this.workers = [];

		this.__apps = [];
		this.__tokens = [];
		this.__namespace = {};

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

	__initMaster(db) {
		const nrp = new NRP(Config.redis);

		const redisClient = createClient(Config.redis);
		this.emitter = new Emitter(redisClient);

		if (this.isPrimary) {
			Logging.logDebug(`Primary Master`);
			nrp.on('activity', (data) => this.__onActivityReceived(data));
		}

		return this.__initMongoConnect()
			.then((db) => {
			// Load Apps
				return new Promise((resolve, reject) => {
					Model.App.findAll().toArray((err, _apps) => {
						if (err) reject(err);
						resolve(this.__apps = _apps);
					});
				});
			})
			.then(() => {
			// Load Tokens
				return new Promise((resolve, reject) => {
					Model.Token.findAll().toArray((err, _tokens) => {
						if (err) reject(err);
						resolve(this.__tokens = _tokens);
					});
				});
			})
			.then(() => {
				this.__namespace['stats'] = {
					emitter: this.emitter.of(`/stats`),
					sequence: {
						super: 0,
						global: 0,
					},
				};

				// Spawn worker processes, pass through build app objects
				this.__apps.map((app) => {
					const token = this.__tokens.find((t) => {
						return app._token && t._id.equals(app._token);
					});
					if (!token) {
						Logging.logWarn(`No Token found for ${app.name}`);
						return null;
					}

					app.token = token;
					app.publicId = Model.App.genPublicUID(app.name, app._id);

					const isSuper = token.authLevel > 2;
					Logging.log(`Name: ${app.name}, App ID: ${app._id}, Public ID: ${app.publicId}`);

					this.__namespace[app.publicId] = {
						emitter: this.emitter.of(`/${app.publicId}`),
						sequence: {
							super: 0,
							global: 0,
						},
					};
					Logging.logDebug(`[${app.publicId}]: Created Namespace for ${app.name}, ${(isSuper) ? 'SUPER' : ''}`);

					if (isSuper) {
						this.__superApps.push(app.publicId);
					}

					return app;
				}).filter((app) => app);

				this.__spawnWorkers({
					apps: this.__apps,
					tokens: this.__tokens,
				});
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
		const namespace = [];

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

		console.log('Creating Dynamic listener');
		const appNamespaces = io.of(/^\/[a-f\d]{24}$/i);
		appNamespaces.use(async (socket, next) => {
			const publicId = socket.nsp.name.substring(1);
			const rawToken = socket.handshake.query.token;

			Logging.logDebug(`Fetching token with value: ${rawToken}`);
			const token = await Model.Token.findOne({value: rawToken});
			if (!token) {
				Logging.logDebug(`Invalid token, closing connection: ${socket.id}`);
				return next('invalid-token');
			}

			Logging.logDebug(`Fetching app with publicId: ${publicId}`);
			const app = await Model.App.findOne({_id: new ObjectId(publicId)});
			if (!app) {
				Logging.logDebug(`Invalid app, closing connection: ${socket.id}`);
				return next('invalid-app');
			}

			if (token.role) {
				socket.join(token.role);
				Logging.log(`[${publicId}][${token.role}] Connected ${socket.id}`);
			} else {
				Logging.log(`[${publicId}][Global] Connected ${socket.id}`);
			}

			socket.on('disconnect', () => {
				Logging.logSilly(`[${publicId}] Disconnect ${socket.id}`);
			});

			next();
		});

		process.on('message', (message, input) => {
			if (message === 'buttress:connection') {
				const connection = input;
				server.emit('connection', connection);
				connection.resume();
				return;
			}
			if (message['buttress:initAppTokens']) {
				const appTokens = message['buttress:initAppTokens']; // This is sh*t
				console.log('Clean me up');
			}
		});

		process.send('workerInitiated');
	}

	__onActivityReceived(data) {
		const publicId = data.appPId;

		if (!this.emitter) {
			throw new Error('SIO Emitter isn\'t defined');
		}

		this.__namespace['stats'].emitter.emit('activity', 1);

		Logging.logSilly(`[${publicId}][${data.role}][${data.verb}]  ${data.path}`);

		// Super apps?
		if (data.isSuper) {
			this.__superApps.forEach((superPublicId) => {
				this.__namespace[superPublicId].sequence['super']++;
				this.__namespace[superPublicId].emitter.emit('db-activity', {
					data: data,
					sequence: this.__namespace[superPublicId].sequence['super'],
				});
				Logging.logDebug(`[${superPublicId}][super][${data.verb}] ${data.path}`);
			});
			return;
		}

		// Disable broadcasting to public space
		if (data.broadcast === false) {
			Logging.logDebug(`[${publicId}][${data.role}][${data.verb}] ${data.path} - Early out as it isn't public.`);
			return;
		}

		// Broadcast on requested channel
		if (!this.__namespace[publicId]) {
			throw new Error('Trying to access namespace that doesn\'t exist');
		}

		if (data.role) {
			if (!this.__namespace[publicId].sequence[data.role]) {
				this.__namespace[publicId].sequence[data.role] = 0;
			}
			Logging.logDebug(`[${publicId}][${data.role}][${data.verb}] ${data.path}`);
			this.__namespace[publicId].sequence[data.role]++;
			this.__namespace[publicId].emitter.in(data.role).emit('db-activity', {
				data: data,
				sequence: this.__namespace[publicId].sequence[data.role],
			});
		} else {
			Logging.logDebug(`[${publicId}][global]: [${data.verb}] ${data.path}`);
			this.__namespace[publicId].sequence.global++;
			this.__namespace[publicId].emitter.emit('db-activity', {
				data: data,
				sequence: this.__namespace[publicId].sequence.global,
			});
		}
	}

	__spawnWorkers(appTokens) {
		Logging.log(`Spawning ${this.processes} Socket Workers`);

		for (let x = 0; x < this.processes; x++) {
			this.workers[x] = cluster.fork();
			this.workers[x].on('message', (res) => {
				if (res === 'workerInitiated') {
					this.workers[x].send({'buttress:initAppTokens': appTokens});
				}
			});
		}

		net.createServer({pauseOnConnect: true}, (connection) => {
			const worker = this.workers[this.__indexFromIP(connection.remoteAddress, this.processes)];
			worker.send('buttress:connection', connection);
		}).listen(Config.listenPorts.sock);
	}

	__initSocketNamespace(io, publicId, appTokens) {
		const namespace = io.of(`/${publicId}`);
		namespace.on('connection', (socket) => {
			const userToken = socket.handshake.query.token;
			const token = appTokens.tokens.find((t) => t.value === userToken);
			if (!token) {
				Logging.logDebug(`Invalid token, closing connection: ${socket.id}`);
				return socket.disconnect(0);
			}

			const app = appTokens.apps.find((a) => a.publicId === publicId);
			if (!app) {
				Logging.logDebug(`Invalid app, closing connection: ${socket.id}`);
				return socket.disconnect(0);
			}

			if (token.role) {
				socket.join(token.role);
				Logging.log(`[${publicId}][${token.role}] Connected ${socket.id}`);
			} else {
				Logging.log(`[${publicId}][Global] Connected ${socket.id}`);
			}

			socket.on('disconnect', () => {
				Logging.logSilly(`[${publicId}] Disconnect ${socket.id}`);
			});
		});

		return namespace;
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

	async __nativeMongoConnect() {
		const dbName = `${Config.app.code}-${Config.env}`;
		const mongoUrl = `mongodb://${Config.mongoDb.url}`;
		Logging.logDebug(`Attempting connection to ${mongoUrl}`);

		const client = await MongoClient.connect(mongoUrl, Config.mongoDb.options)

		return await client.db(dbName);
	}

	async __initMongoConnect() {
		const db = await this.__nativeMongoConnect();
		await Model.init(db);
		return db;
	}
}

module.exports = BootstrapSocket;
