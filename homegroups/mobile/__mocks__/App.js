const React = require('react');
const {View, Text} = require('react-native');
const App = () => React.createElement(View, {testID: 'app'}, React.createElement(Text, null, 'App'));
module.exports = App;
module.exports.default = App;
