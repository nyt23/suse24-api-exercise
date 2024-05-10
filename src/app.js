import express, {response} from 'express';
import fs from 'fs';
import {v4 as uuid} from "uuid";
const app = express()
import bodyParser from 'body-parser';
app.use(bodyParser.json());
import { BasicStrategy } from 'passport-http';
import passport from 'passport';
import bcrypt from "bcrypt";
import jwt from 'jsonwebtoken'
import {ExtractJwt} from "passport-jwt";
import JwtStrategy from "passport-jwt/lib/strategy.js";


// get all questions
app.get('/api/questions', (req, res) => {
   try {
       const questionsData = fs.readFileSync('./data/questions.json', 'utf-8');
       let questions = JSON.parse(questionsData);
       questions = questions.map((question) => {
           question['correctAnswer'] = undefined;
           return question
       });
       res.status(200).send(questions);

   } catch (e) {
       console.error(e.stack);
       res.status(500).send('Error parsing data');
   }
});



const usersData = fs.readFileSync('./data/users.json', 'utf-8');
const users = JSON.parse(usersData);

passport.use(new BasicStrategy(
    function (userName, password, done) {
        console.log('userName:', userName);
        console.log('Password:', password);

        const user = users.find(u => u.userName === userName);
        console.log('User:', user);

        if (!user) {
            return done(null, false, { message: 'User not found' });
        }
        if (!bcrypt.compareSync(password, user.password)) {
            return done(null, false, { message: 'Incorrect password' });
        }
        return done(null, user) // when success
    }
));


const opts = {}
opts.jwtFromRequest = ExtractJwt.fromAuthHeaderAsBearerToken();
opts.secretOrKey = 'my-secret';
passport.use(new JwtStrategy(opts, function(jwt_payload, done) {
    done(null, {
        name: jwt_payload.sub
    })
}));


app.post('/authenticate', passport.authenticate('basic', {session:false}), (req, res) => {
    const token = jwt.sign({
            roles:req.user.roles
        },
        'my-secret',
        {
            subject: req.user.userName,
            expiresIn: '1d'
        })

    res.status(200).send(`${token}`)
});


// find runId game runs
app.post('/api/game-runs', passport.authenticate('jwt', {session:false}), (req, res) => {
    console.log(req.user);
    const gameRunData = {
        id: uuid(),
        userName: req.user.name,
        createdAt: new Date().toISOString(),
        responses: {},
    }
    try {
        const gameRunsData = fs.readFileSync('./data/game-runs.json');
        const gameRuns = JSON.parse(gameRunsData);
        gameRuns.push(gameRunData);
        fs.writeFileSync('./data/game-runs.json', JSON.stringify(gameRuns), {flag: 'w'});
        // res.status(200).set("Location", `/game-runs/${gameRunData.id}`).send(gameRunData);
        res.status(200).send( {runId: gameRunData.id});

    } catch(e) {
        res.sendStatus(500);
    }
});

// update game runs data
app.put('/api/game-runs/:runId/responses', passport.authenticate('jwt', {session:false}), (req, res) => {
    try {
        const { runId } = req.params;
        const responseUpdates = req.body;
        const gameRunsData = fs.readFileSync('./data/game-runs.json');
        let gameRuns = JSON.parse(gameRunsData);

        let found = false;

        gameRuns = gameRuns.map((run) => {
            if (run.id === runId) {
                found = true;
                return { ...run, responses: { ...run.responses, ...responseUpdates } };
            }
            return run;
        });

        if (!found) {
            res.status(404).send("Game run not found.");
        } else {
            fs.writeFileSync('./data/game-runs.json', JSON.stringify(gameRuns));
            res.sendStatus(200);
        }
    } catch (e) {
        console.error(e.stack);
        res.status(500);
    }
});


// retrieve the results for a specific game run and return answer to boolean
app.get('/api/game-runs/:runId/results', passport.authenticate('jwt', {session:false}), (req, res) => {
    const { runId } = req.params;
    const gameRunsData = fs.readFileSync('./data/game-runs.json');
    const gameRuns = JSON.parse(gameRunsData);
    const gameRun = gameRuns.find(gamerun => {return gamerun.id === runId});


    if (!gameRun) {
        res.status(404).send('Game run not found');
        return;
    }

    const questionsData = fs.readFileSync('./data/questions.json');
    const questions = JSON.parse(questionsData);
    console.log(questions);
    const responsesKeys = Object.keys(gameRun.responses.responses);
    let responses = {}
    console.log(gameRun.responses)
        responsesKeys.forEach(key => {
            const question = questions.find(question => question.id === key);
            responses[key] = question.correctAnswer === gameRun.responses[key]
        });

    let results = {
        id: gameRun.id,
        userName: gameRun.userName,
        createdAt: gameRun.createdAt,
        responses: responses
    };

    res.status(200).send(results);

});


export default app;
