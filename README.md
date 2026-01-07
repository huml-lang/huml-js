# huml-js

An experimental HUML parser implementation in javascript. 

## Installation
```
npm install @huml-lang/huml
```

## Usage
```javascript
import { parse, stringify } from '@huml-lang/huml'

const humlDoc = `\
# A sample HUML document.
website::
  hostname: "huml.io"
  ports:: 80, 443 # Inline list.
  enabled: true
  factor: 3.14
  props:: mime_type: "text/html", encoding: "gzip" # Inline dict.
  tags:: # Multi-line list.
    - "markup"
    - "webpage"
    - "schema"

haikus::
  one: """
    A quiet language
    Lines fall into their places
    Nothing out of place
  """
`;

// Parse HUML into JS data structures.
const obj = parse(humlDoc);
console.log("Parsed Object:", obj);

// Dump JS data structures into HUML.
const output_huml = stringify(obj);
console.log("Serialized Output:\n", output_huml);
```

### License
Licensed under the MIT license.

