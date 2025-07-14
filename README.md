# huml-js

An experimental HUML parser implementation in javascript. 

## Installation
```
npm install @huml-lang/huml
```

## Usage
```javascript
import { parse, stringify } from '@huml-lang/huml'

// Parse HUML into JS data structures.
console.log(parse(humlDoc));

// Dump JS data structures into HUML.
console.log(stringify(obj));

```

### License
Licensed under the MIT license.

