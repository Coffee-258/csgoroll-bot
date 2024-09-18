const FS = require("fs");
const axios = require('axios');

const { createSubscription } = require('./subscriptions.js');
const { OPERATIONS, QUERYS } = require('./enums.js');

const sessionFilePath = "cfg/session.json";

const cookieName = "session";

let loading = false;

async function renewSession(d) {
    let domain = d ?? "csgoroll.gg";
    if (loading) {
        return;
    }

    loading = true;

    return new Promise((resolve) => {

        axios({
            method: 'post',
            url: `https://api.${domain}/auth/local`,
            headers: { "Content-Type": "application/json" },
            data: {
                signUp: false,
                email: global.secrets.roll_email,
                password: global.secrets.roll_password
            }

        }).then(res => {
            let cookie = (res.headers['set-cookie'])
                .find(cookie => cookie.includes(cookieName))
                ?.match(new RegExp(`^${cookieName}=(.+?);`))
                ?.[1];

            if (cookie != null) {
                if (d != null) {
                    resolve(cookie);
                    return;
                }

                global.session.session = cookie;
                console.log("New csgoroll session created " + session);
            }

            FS.writeFileSync(sessionFilePath, JSON.stringify(global.session));

            loading = false;
        }).catch(err => {
            //console.warn(err);
            resolve();
        });
    });
}

function updateSteamSession(token) {
    global.session.steam = token;

    FS.writeFileSync(sessionFilePath, JSON.stringify(global.session));
}

function getSession() {
    return global.session.session;
}

function updateCsgorollLoyaltyToken(con, token) {
    let variables = {
        input: {
            userId: global.license.roll_user_id,
            steamAccessToken: `&quot;${token}&quot;`
        },
    }

    console.log("Sending loyalty token to csgoroll API");

    let loyaltyTokenSubscription = createSubscription(OPERATIONS.changeSteamToken, QUERYS.changeSteamToken, variables);
    con.sendUTF(JSON.stringify(loyaltyTokenSubscription));
}

module.exports = {
    getSession,
    renewSession,
    updateCsgorollLoyaltyToken,
    updateSteamSession
};