module.exports.RequestError = class RequestError extends Error {
	constructor(code, message) {
		super(message);
		this.code = code;
		this.name = 'RequestError';
	}
};

module.exports.RouteMissingModel = class RequestError extends Error {
	constructor(message) {
		super(message);
		this.name = 'RouteMissingModel';
	}
};
