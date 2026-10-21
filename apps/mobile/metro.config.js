// Metro pour le monorepo pnpm (node-linker=hoisted) : getDefaultConfig détecte la racine
// du workspace ; on force en plus une copie unique des modules qui ne tolèrent pas les doublons.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

const SINGLETONS = [
  'react',
  'react-dom',
  'react-native',
  'react-native-web',
  'react-native-reanimated',
  'react-native-worklets',
  'react-native-gesture-handler',
  'react-native-safe-area-context',
  'react-native-screens',
  'expo',
  'expo-router',
];
const anchor = path.join(projectRoot, 'package.json');
const upstream = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = upstream ?? context.resolveRequest;
  const isSingleton = SINGLETONS.some((name) => moduleName === name || moduleName.startsWith(`${name}/`));
  if (isSingleton && !context.originModulePath.startsWith(projectRoot + path.sep)) {
    return resolve({ ...context, originModulePath: anchor }, moduleName, platform);
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
