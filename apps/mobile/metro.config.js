// Metro pour le monorepo pnpm (node-linker=hoisted) : getDefaultConfig détecte la racine
// du workspace ; on force en plus une copie unique des modules qui ne tolèrent pas les doublons.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;

// Build de production (expo export, dont Vercel) : les variables EXPO_PUBLIC_* sont inlinées dans le bundle,
// leur absence donnerait une page blanche. On échoue tout de suite en nommant la variable.
if (process.env.NODE_ENV === 'production') {
  const missing = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'].filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(
      `Variable(s) manquante(s) au build : ${missing.join(', ')} (voir apps/mobile/.env.example). ` +
        'Sur Vercel : Settings → Environment Variables, puis Redeploy.',
    );
  }
}

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
