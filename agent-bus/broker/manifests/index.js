const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const manifestsDir = path.join(__dirname, '..', 'manifests');
const manifests = {};

// Load all YAML files in the manifests directory
fs.readdirSync(manifestsDir)
  .filter(file => file.endsWith('.yaml') || file.endsWith('.yml'))
  .forEach(file => {
    try {
      const manifestPath = path.join(manifestsDir, file);
      const toolId = path.basename(file, path.extname(file));
      const manifest = yaml.load(fs.readFileSync(manifestPath, 'utf8'));
      manifests[toolId] = manifest;
    } catch (error) {
      console.error(`Error loading manifest ${file}:`, error);
    }
  });

module.exports = manifests;
