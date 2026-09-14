// SPDX-FileCopyrightText: 2026 Kaito Udagawa <umireon@kaito.tokyo>
//
// SPDX-License-Identifier: Apache-2.0

export const COLAB_TOOLS = [
  {
    name: "open_colab_browser_connection",
    description:
      "Returns the Google Colab URL that opens a browser connection to this bridge. If a Colab session is already connected, connected is true.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
      $schema: "http://json-schema.org/draft-07/schema#",
    },
  },
  {
    name: "add_code_cell",
    description:
      "Inserts a code type cell at the provided index and shifts existing cells. The resulting new cell id is returned.",
    inputSchema: {
      type: "object",
      properties: {
        cellIndex: {
          type: "integer",
          minimum: 0,
          maximum: Number.MAX_SAFE_INTEGER,
          description: "The index at which to insert the cell.",
        },
        language: {
          type: "string",
          enum: ["python", "r", "julia"],
          description: "The programming language of the new cell.",
        },
        code: { type: "string", description: "The code content of the new cell." },
      },
      required: ["cellIndex", "language", "code"],
      additionalProperties: false,
      $schema: "http://json-schema.org/draft-07/schema#",
    },
  },
  {
    name: "add_text_cell",
    description:
      "Inserts a text type cell at the provided index and shifts existing cells. The resulting new cell id is returned.",
    inputSchema: {
      type: "object",
      properties: {
        cellIndex: {
          type: "integer",
          minimum: 0,
          maximum: Number.MAX_SAFE_INTEGER,
          description: "The index at which to insert the cell.",
        },
        content: {
          type: "string",
          description: "The content of the new cell. This can include Markdown and LaTeX syntax.",
        },
      },
      required: ["cellIndex", "content"],
      additionalProperties: false,
      $schema: "http://json-schema.org/draft-07/schema#",
    },
  },
  {
    name: "delete_cell",
    description: "Deletes the cell with the provided cell ID.",
    inputSchema: {
      type: "object",
      properties: { cellId: { type: "string", description: "The ID of the cell to delete." } },
      required: ["cellId"],
      additionalProperties: false,
      $schema: "http://json-schema.org/draft-07/schema#",
    },
  },
  {
    name: "get_cells",
    description: "Gets a range of cells as JSON from the notebook.",
    inputSchema: {
      type: "object",
      properties: {
        cellIndexStart: {
          type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER,
          description: "The starting index for the cell range (inclusive). If not provided, this defaults to 0.",
        },
        cellIndexEnd: {
          type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER,
          description: "The end index for the cell range (inclusive). This must be greater than or equal to cellIndexStart. If not provided, this defaults to the last available cell index.",
        },
        includeOutputs: {
          type: "boolean", default: false,
          description: "Whether to include the code cell execution outputs in the response. If not provided, this defaults to false.",
        },
      },
      additionalProperties: false,
      $schema: "http://json-schema.org/draft-07/schema#",
    },
  },
  {
    name: "move_cell",
    description: "Moves a cell to the provided index and shifts existing cells.",
    inputSchema: {
      type: "object",
      properties: {
        cellId: { type: "string", description: "The ID of the cell to move." },
        cellIndex: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER, description: "The index to move the cell to." },
      },
      required: ["cellId", "cellIndex"],
      additionalProperties: false,
      $schema: "http://json-schema.org/draft-07/schema#",
    },
  },
  {
    name: "run_code_cell",
    description: "Executes the code in the cell with the provided cell ID. The cell must be a code cell type. The output of the cell execution is returned.",
    inputSchema: {
      type: "object",
      properties: { cellId: { type: "string", description: "The ID of the code cell to execute." } },
      required: ["cellId"],
      additionalProperties: false,
      $schema: "http://json-schema.org/draft-07/schema#",
    },
  },
  {
    name: "update_cell",
    description: "Overwrites the contents of the cell with the provided new content. The cell must already exist and is identified by its cell ID.",
    inputSchema: {
      type: "object",
      properties: {
        cellId: { type: "string", description: "The ID of the cell to update." },
        content: { type: "string", description: "The new content of the cell." },
      },
      required: ["cellId", "content"],
      additionalProperties: false,
      $schema: "http://json-schema.org/draft-07/schema#",
    },
  },
];
