const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');
const mongoose = require('mongoose');
const app = express();
const router = express.Router();

let databaseState = 0;
let logs = [];

function logError(message, error) {
  logs.push(message + ' : ' + error);
  return message;
}

function waitForDatabase(callback) {
  if (databaseState === 1) {
    callback();
  }
  else {
    setTimeout(waitForDatabase, 1000, callback);
  }
}

mongoose.connect('OMMITTED FOR PRIVACY')
  .then(() => {
    databaseState = 1;
  })
  .catch((error) => {
    logs.push("DATABASE ERROR : " + error);
    databaseState = 2;
  });

const userSchema = new mongoose.Schema({
  username: String,
  data: Object
});

const publicLevelSchema = new mongoose.Schema({
  id: String,
  data: Object
});

const User = mongoose.model('User', userSchema);
const PublicLevel = mongoose.model('PublicLevel', publicLevelSchema);

app.use(cors()); 
router.use(cors()); 

router.get('/', (req, res) => {
  res.send(`<pre>Database status: ${databaseState}\nLogs:\n${logs.join('\n')}</pre>`);
});

router.use(express.json());

router.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

router.post('/login', (req, res) => {
  waitForDatabase(() => {
    const { username, password } = req.body;
    User.findOne({ username })
      .then((user) => {
        if (!user) {
          return res.json({ error: logError('Invalid username!') });
        }
        if (user.data.password !== password) {
          return res.json({ error: logError('Invalid password!') });
        }
        return res.json({ error: 'ok' });
      })
      .catch((error) => {
        return res.json({ error: logError('Database user query error!', error) });
      });
  });
});

router.post('/signup', (req, res) => {
  waitForDatabase(() => {
    const { username, password } = req.body;
    User.findOne({ username })
      .then((user) => {
        if (user) {
          return res.json({ error: 'Username already exists!' });
        }
        return User.create({ username, password })
          .then(() => {
            logs.push('SIGNUP SUCCESSFUL');
            return res.json({ error: 'ok' });
          })
          .catch((error) => {
            return res.json({ error: logError('Database user creation error!', error) });
          });
      })
      .catch((error) => {
        return res.json({ error: logError('Database user query error!', error) });
      });
  });
});

router.post('/sync', (req, res) => {
  waitForDatabase(() => {
    const { playerData } = req.body;
    User.findOneAndUpdate({ username: playerData.username }, { $set: { data: playerData } }, { new: true })
      .then((user) => {
        if (!user) {
          return res.json({ error: 'Username not found!' });
        }
        const promises = playerData.publishedLevels.map((level) => {
          if (!level.sentToServer) {
            level.sentToServer = true;
            return PublicLevel.findOne({ id: level.id })
              .then((existingLevel) => {
                if (existingLevel) {
                  return res.json('Level is already in the database!');
                }
                return PublicLevel.create({ id: level.id, data: level });
              })
              .then((newLevel) => {
                logs.push('LEVEL ADDED TO DATABASE! : ' + newLevel.data.name);
              });
          }
        });
        Promise.all(promises)
          .then(() => {
            return res.json({ error: 'ok', playerData });
          })
          .catch((error) => {
            return res.json({ error: logError('Database public level update error!', error) });
          });
      })
      .catch((error) => {
        return res.json({ error: logError('Database user update error!', error) });
      });
  });
});

router.post('/load', (req, res) => {
  waitForDatabase(() => {
    const { playerData } = req.body;
    User.findOne({ username: playerData.username })
      .then((user) => {
        if (!user) {
          return res.json({ error: 'Username not found!' });
        }
        return res.json({ error: 'ok', playerData: user.data });
      })
      .catch((error) => {
        return res.json({ error: logError('Database user query error!', error) });
      });
  });
});

router.post('/getlevels', (req, res) => {
  waitForDatabase(() => {
    PublicLevel.find()
      .then((levels) => {
        logs.push('SENDING LEVELS ' + levels.length);
        res.json({ error: 'ok', levels: levels.map(level => level.data) });
      })
      .catch((error) => {
        return res.json({ error: logError('Database public levels query error!', error) });
      });
  });
});

app.use('/.netlify/functions/api', router);

module.exports.handler = serverless(app);
