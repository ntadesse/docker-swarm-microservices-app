module.exports = {
  mongoURI: process.env.MONGO_URL || "mongodb://emongo:27017/epoc",
  secretOrKey: process.env.JWT_SECRET || "k1234e6s78h9av"
};
