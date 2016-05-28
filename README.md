# pg-job-queue

A job queue for node.js based on PostgreSQL.

##### This library is in early-development, not stable enough for production.

[![npm version](https://badge.fury.io/js/pg-job-queue.svg)](https://badge.fury.io/js/pg-job-queue)
[![Build Status](https://travis-ci.org/jameshy/pg-job-queue.svg?branch=master)](https://travis-ci.org/jameshy/pg-job-queue)


## Installation
```bash
npm install pg-job-queue
```

## Create a job

```javascript
const jobqueue = require('pg-job-queue')
const queue = new jobqueue('postgres://postgres@localhost/my-job-queue')

queue.addJob({
    type: 'sendmail.welcome',
    data: {
        toAddress: 'demo@example.com',
        message: 'hello'
    }
})
```


## Process jobs as they arrive

#### Programmatically

```javascript

const jobqueue = require('pg-job-queue')
const queue = new jobqueue('postgres://postgres@localhost/my-job-queue')

// define your job handlers
var handlers = {
    sendmail: {
        welcome: function(job) {
            return sendMail(job.data.toAddress, job.data.message)
            .then(() => {
                return job.finish()
            })
        }
    }
}
queue.addHandlers(handlers)

queue.startProcessing()
```

#### Using process-job-queue tool

##### 1. Create handlers.js file
```javascript
module.exports = {
    sendmail: {
        welcome: function(job) {
            return sendMail(job.data.toAddress, job.data.message).then(() => {
                return job.finish()
            })
        }
    }
}
```

##### 2. Run process-job-queue
```bash
node_modules/pg-job-queue/bin/process-job-queue -f ./handlers.js -c postgres://postgres@localhost/my-job-queue
```

## License
[MIT](LICENSE)
