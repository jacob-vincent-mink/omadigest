import {
  array,
  boolean,
  discriminatedUnion,
  enum as enumeration,
  literal,
  number,
  object,
  record,
  string,
  union
} from "zod/v4";

// Source files keep Zod's conventional `z.*` API while the release bundle
// includes only the constructors OmaDigest actually uses.
export const z = {
  array,
  boolean,
  discriminatedUnion,
  enum: enumeration,
  literal,
  number,
  object,
  record,
  string,
  union
};
