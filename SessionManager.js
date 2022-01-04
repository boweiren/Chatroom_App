const crypto = require('crypto');

class SessionError extends Error {};

function SessionManager (){
	// default session length - you might want to
	// set this to something small during development
	const CookieMaxAgeMs = 600000;

	// keeping the session data inside a closure to keep them protected
	const sessions = {};

	// might be worth thinking about why we create these functions
	// as anonymous functions (per each instance) and not as prototype methods
	this.createSession = (response, username, maxAge = CookieMaxAgeMs) => {
		/* To be implemented */
        console.log("Input to createSession():" + "username:" + username + " maxAge:" + maxAge)
        // Generate a random string token long enough to guarantee uniqueness and confidentiality
        let token = crypto.randomBytes(64).toString('hex');

        // Store the token in the sessions object
        let timeCreated = Date.now();
        sessions[token] = {
            username: username, 
            timeCreated: timeCreated,
            timeExpired: timeCreated + maxAge
        };

        response.cookie('cpen322-session', token, { maxAge: maxAge });

        // the token should be deleted after maxAge milliseconds
        setTimeout(() => {
            delete sessions[token];
        }, maxAge);
	};

	this.deleteSession = (request) => {
		/* To be implemented */
        let cookie = request.session;
        delete request['username'];
        delete request['session'];
        if (cookie != null) {
            delete sessions[cookie];
        }
	};

	this.middleware = (request, response, next) => {
		/* To be implemented */
        // try to read the cookie information from the request
        let cookie = request.headers.cookie;

        if (cookie == null) {
            // if the cookie header was not found, "short-circuit" the middleware
            next(new SessionError('No cookie found.'));
        } else {
            console.log('cookie is ' + cookie);
            let token = cookie.split(';').map(s => s.split('=').pop().trim()).shift();
            console.log('token is ' + token);
            if (sessions[token] == null) {
                // if the token is not found, "short-circuit" the middleware
                console.log(sessions);
                next(new SessionError('No valid cookie found.'));
            } else {
                request.username = sessions[token].username;
                request.session = token;
                next();
            }
        }

	};

    this.middlewareErrorHandler = function(err, req, res, next) {
        console.error(err);

        // check if the error is a SessionError
        if (err instanceof SessionError) {
            if (req.headers.accept == 'application/json') {
                res.status(401).send(JSON.stringify(err.message));
            } else {
                res.redirect('/login');
            }
        } else {
            res.status(500).send();
        }
    }

	// this function is used by the test script.
	// you can use it if you want.
	this.getUsername = (token) => ((token in sessions) ? sessions[token].username : null);
};

// SessionError class is available to other modules as "SessionManager.Error"
SessionManager.Error = SessionError;

module.exports = SessionManager;