module.exports.RequestError = class RequestError extends Error {
	constructor(code, message) {
		super(message);
		this.code = code;
		this.name = 'RequestError';
	}
};

module.exports.RouteHasNoModel = class RequestError extends Error {
	constructor(code, message) {
		super(message);
		this.code = code;
		this.name = 'RouteHasNoModel';
	}
};
