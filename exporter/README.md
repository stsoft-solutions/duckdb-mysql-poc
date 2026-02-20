npm init -y 
npm i -D typescript tsx @types/node

***package.json***
```
{
  "name": "mycli",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "mycli": "dist/cli.js"
  },
  "files": ["dist"],
  "scripts": {
    "dev": "tsx src/cli.ts",
    "build": "tsc -p tsconfig.build.json",
    "start": "node dist/cli.js",
    "lint": "eslint .",
    "test": "node --test"
  },
  "engines": {
    "node": ">=20"
  }
}
```

tsconfig.json
```
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["node"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

tsconfig.build.json
```
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "sourceMap": true,
    "moduleResolution": "NodeNext",
    "module": "NodeNext"
  },
  "include": ["src/**/*.ts"]
}
```