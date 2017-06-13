'use strict';

module.exports = function(arrays, array) {
  var hash = {};

  for(var key in arrays) {
    hash[arrays[key]] = key;
  }

  return hash.hasOwnProperty(array);
};
