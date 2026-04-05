const { config } = require("./backend/src/config");
const app = require("./backend/server");

async function start() {
  await app.ready;
  app.listen(config.port, () => {
    console.log(
      `Cogitation Works backend listening on http://localhost:${config.port}`,
    );
  });
}

if (require.main === module) {
  start().catch((error) => {
    console.error("Failed to start backend server", error);
    process.exit(1);
  });
}

module.exports = app;
