// RAKKA-style compact ANSI keyboard, recreated for the offline Rev1 UI.
// Only printable single-character keys are selectable; modifiers remain disabled.
export const keyboardRows = [
  [
    {
      "label": "`",
      "key": "`",
      "units": 1
    },
    {
      "label": "1",
      "key": "1",
      "units": 1
    },
    {
      "label": "2",
      "key": "2",
      "units": 1
    },
    {
      "label": "3",
      "key": "3",
      "units": 1
    },
    {
      "label": "4",
      "key": "4",
      "units": 1
    },
    {
      "label": "5",
      "key": "5",
      "units": 1
    },
    {
      "label": "6",
      "key": "6",
      "units": 1
    },
    {
      "label": "7",
      "key": "7",
      "units": 1
    },
    {
      "label": "8",
      "key": "8",
      "units": 1
    },
    {
      "label": "9",
      "key": "9",
      "units": 1
    },
    {
      "label": "0",
      "key": "0",
      "units": 1
    },
    {
      "label": "-",
      "key": "-",
      "units": 1
    },
    {
      "label": "=",
      "key": "=",
      "units": 1
    },
    {
      "label": "Backspace",
      "key": null,
      "units": 2
    }
  ],
  [
    {
      "label": "Tab",
      "key": null,
      "units": 1.5
    },
    {
      "label": "Q",
      "key": "Q",
      "units": 1
    },
    {
      "label": "W",
      "key": "W",
      "units": 1
    },
    {
      "label": "E",
      "key": "E",
      "units": 1
    },
    {
      "label": "R",
      "key": "R",
      "units": 1
    },
    {
      "label": "T",
      "key": "T",
      "units": 1
    },
    {
      "label": "Y",
      "key": "Y",
      "units": 1
    },
    {
      "label": "U",
      "key": "U",
      "units": 1
    },
    {
      "label": "I",
      "key": "I",
      "units": 1
    },
    {
      "label": "O",
      "key": "O",
      "units": 1
    },
    {
      "label": "P",
      "key": "P",
      "units": 1
    },
    {
      "label": "[",
      "key": "[",
      "units": 1
    },
    {
      "label": "]",
      "key": "]",
      "units": 1
    },
    {
      "label": "\\",
      "key": "\\",
      "units": 1.5
    }
  ],
  [
    {
      "label": "Caps",
      "key": null,
      "units": 1.9
    },
    {
      "label": "A",
      "key": "A",
      "units": 1
    },
    {
      "label": "S",
      "key": "S",
      "units": 1
    },
    {
      "label": "D",
      "key": "D",
      "units": 1
    },
    {
      "label": "F",
      "key": "F",
      "units": 1
    },
    {
      "label": "G",
      "key": "G",
      "units": 1
    },
    {
      "label": "H",
      "key": "H",
      "units": 1
    },
    {
      "label": "J",
      "key": "J",
      "units": 1
    },
    {
      "label": "K",
      "key": "K",
      "units": 1
    },
    {
      "label": "L",
      "key": "L",
      "units": 1
    },
    {
      "label": ";",
      "key": ";",
      "units": 1
    },
    {
      "label": "'",
      "key": "'",
      "units": 1
    },
    {
      "label": "Enter",
      "key": null,
      "units": 2.1
    }
  ],
  [
    {
      "label": "Shift",
      "key": null,
      "units": 2.4
    },
    {
      "label": "Z",
      "key": "Z",
      "units": 1
    },
    {
      "label": "X",
      "key": "X",
      "units": 1
    },
    {
      "label": "C",
      "key": "C",
      "units": 1
    },
    {
      "label": "V",
      "key": "V",
      "units": 1
    },
    {
      "label": "B",
      "key": "B",
      "units": 1
    },
    {
      "label": "N",
      "key": "N",
      "units": 1
    },
    {
      "label": "M",
      "key": "M",
      "units": 1
    },
    {
      "label": ",",
      "key": ",",
      "units": 1
    },
    {
      "label": ".",
      "key": ".",
      "units": 1
    },
    {
      "label": "/",
      "key": "/",
      "units": 1
    },
    {
      "label": "Shift",
      "key": null,
      "units": 2.6
    }
  ],
  [
    {
      "label": "Ctrl",
      "key": null,
      "units": 1.3
    },
    {
      "label": "Win",
      "key": null,
      "units": 1.3
    },
    {
      "label": "Alt",
      "key": null,
      "units": 1.3
    },
    {
      "label": "Space",
      "key": null,
      "units": 6.2
    },
    {
      "label": "Alt",
      "key": null,
      "units": 1.3
    },
    {
      "label": "Menu",
      "key": null,
      "units": 1.3
    },
    {
      "label": "Ctrl",
      "key": null,
      "units": 1.3
    }
  ]
];
export const selectableKeys = new Set(keyboardRows.flat().filter(key=>key.key!==null).map(key=>key.key.toLowerCase()));
export function normalizeKeyboardTarget(value) {
  if (typeof value !== "string" || value.length !== 1) return null;
  const normalized = value.toLowerCase();
  return selectableKeys.has(normalized) ? normalized : null;
}
