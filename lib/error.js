"use strict";

class Error {
    constructor(code, params, message) {
        this.code = code;
        this.params = Array.prototype.slice.call(params);
        this.message = message;
    }

    toString() {
        return this.code + ':' +
            this.params.join(',') + ':' +
            this.message;
    }

    static versionMismatch() {
        return new this(300, arguments, 'Version mismatch').toString();
    }

    static conntypeMismatch() {
        return new this(301, arguments, 'Connection types not supported').toString();
    };

    static extMismatch() {
        return new this(302, arguments, 'Extension mismatch').toString();
    };

    static badRequest() {
        return new this(400, arguments, 'Bad request').toString();
    };

    static clientUnknown() {
        return new this(401, arguments, 'Unknown client').toString();
    };

    static parameterMissing() {
        return new this(402, arguments, 'Missing required parameter').toString();
    };

    static channelForbidden() {
        return new this(403, arguments, 'Forbidden channel').toString();
    };

    static channelUnknown() {
        return new this(404, arguments, 'Unknown channel').toString();
    };

    static channelInvalid() {
        return new this(405, arguments, 'Invalid channel').toString();
    };

    static extUnknown() {
        return new this(406, arguments, 'Unknown extension').toString();
    };

    static publishFailed() {
        return new this(407, arguments, 'Failed to publish').toString();
    };

    static serverError() {
        return new this(500, arguments, 'Internal server error').toString();
    };

}

module.exports = Error;