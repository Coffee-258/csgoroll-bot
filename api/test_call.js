const axios = require('axios');
const util = require('util')
const { decodeGraphqlUrl } = require('./modules/subscriptions.js');

function main() {

  let variables = {
    first: 3,
    minValue: 3,
    name: "",
    orderBy: "VALUE_DESC",
    distinctValues: true, 
    //after: "WzI5MDcxLDJd" cursor from previous result
  }

  let extensions = {
    persistedQuery: {
        version: 1,
        sha256Hash: "50f218ab7445098f9f77dab9c6348f61841acf38bdb2851e4e595810719bc348"
    }
  };

  axios({
    method: 'get',
    url: decodeGraphqlUrl('ItemVariantList', variables, extensions),
  }).then(response => {
    //console.log(response.data.data.itemVariants.edges);
    console.log(response.data);
    console.log(util.inspect(response.data, false, null, true /* enable colors */))

  }).catch(err => {
    console.warn(err.message);
    resolve();
  });
}

main();