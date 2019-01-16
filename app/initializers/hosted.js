export function initialize() {
  
  var parseQueryString = function( queryString ) {
    var params = {}, queries, temp, i, l;
    // Split into key/value pairs
    queries = queryString.split("&");
    // Convert the array of strings into an object
    for ( i = 0, l = queries.length; i < l; i++ ) {
      temp = queries[i].split('=');
      params[temp[0]] = decodeURIComponent(temp[1]);
    }
    return params;
  };
  
  if ( document.location.hash.substring(1) !== "" ) {
    var urlObj = parseQueryString(document.location.hash.substring(1));
    
    window.parsedQueryHash = urlObj;
  } else if ( document.location.search.substring(1) !== "" ) {
    var searchObj = parseQueryString(document.location.search.substring(1));

    window.parsedQueryHash = searchObj;
  } else {
    window.parsedQueryHash = null;
  }
}

export default {
  initialize
};
