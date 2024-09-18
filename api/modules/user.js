const axios = require('axios');

const { decodeGraphqlUrl } = require('./subscriptions.js');
const { getSession } = require('./session.js');

async function getUserData() {
    let variables = {
    };

    let extensions = {
        persistedQuery: {
            version:1,
            sha256Hash: "927fd12a0365f51072af3f051a75fbd28e035fa17d4744b6d7c2cafeccbd83fc"
        }
    }

    return new Promise((resolve) => {
        axios({
            method: 'get',
            url: decodeGraphqlUrl('CurrentUser', variables, extensions),
            headers: { "Cookie": `session=${getSession()};` }, 
        }).then(response => {
            resolve(response.data);
        }).catch(err => {
            console.warn(err.message);
            resolve();
        });
    });
}

module.exports = {
    getUserData
}