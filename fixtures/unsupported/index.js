const express = require('express');

const app = express();

app.get('/', (req, res) => {
  res.send('Hello from a plain Express app');
});

app.listen(3000, () => {
  console.log('listening on http://localhost:3000');
});
