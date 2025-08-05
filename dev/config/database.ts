export default {
  /**
   * Specifies which connection definition should be used as default connection
   */
  defaultConnection: "default",

  connections: {
    ["default"]: {
      /**
       * Available drivers:
       * mongodb, mysql
       */
      driver: "mongodb",
      url: process.env.MONGODB_URL,
    },
  },
};
