const fs = require('fs');

function cloneDefaultValue(defaultValue) {
  const resolved = typeof defaultValue === 'function'
    ? defaultValue()
    : defaultValue;

  return JSON.parse(JSON.stringify(resolved));
}

function createJsonFileStore({
  filePath,
  defaultValue,
  label,
  readTransform,
  writeTransform
}) {
  function ensureFile() {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(cloneDefaultValue(defaultValue), null, 2), 'utf8');
    }
  }

  function read() {
    ensureFile();
    const raw = fs.readFileSync(filePath, 'utf8').trim();

    if (!raw) {
      return cloneDefaultValue(defaultValue);
    }

    try {
      const parsed = JSON.parse(raw);
      return typeof readTransform === 'function' ? readTransform(parsed) : parsed;
    } catch (error) {
      console.error(`Error parsing ${label || filePath}:`, error);
      return cloneDefaultValue(defaultValue);
    }
  }

  function write(value) {
    const nextValue = typeof writeTransform === 'function' ? writeTransform(value) : value;

    ensureFile();
    fs.writeFileSync(filePath, JSON.stringify(nextValue, null, 2), 'utf8');
    return nextValue;
  }

  return {
    ensureFile,
    read,
    write
  };
}

module.exports = {
  createJsonFileStore
};
