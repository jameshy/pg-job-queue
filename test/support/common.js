'use strict'

global.Promise = require('bluebird')
global.sinon = require('sinon')
global.chai = require("chai")
global.expect = chai.expect
global.assert = chai.assert

var chaiAsPromised = require('chai-as-promised')
chai.use(chaiAsPromised)

require('sinon-as-promised')(Promise)

require('co-mocha')