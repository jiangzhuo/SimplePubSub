var should = require('should');
var Channel = require('../lib/channel.js');
describe("Channel", function () {
    describe("expand", function () {
        it("returns all patterns that match a channel", function () {
            should.deepEqual(["/**", "/foo", "/*"],
                Channel.expand("/foo"))

            should.deepEqual(["/**", "/foo/bar", "/foo/*", "/foo/**"],
                Channel.expand("/foo/bar"))

            should.deepEqual(["/**", "/foo/bar/qux", "/foo/bar/*", "/foo/**", "/foo/bar/**"],
                Channel.expand("/foo/bar/qux"))
        })
    });
});
