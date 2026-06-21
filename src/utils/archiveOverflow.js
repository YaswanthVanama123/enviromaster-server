import mongoose from "mongoose";

function toPlain(entry) {
  return entry && typeof entry.toObject === "function" ? entry.toObject() : entry;
}

function readPath(doc, field) {
  return field.split(".").reduce((o, k) => (o == null ? o : o[k]), doc);
}

export async function archiveOverflowInPlace({ archiveModelName, baseRef, arr, field, cap }) {
  if (!Array.isArray(arr) || arr.length <= cap) return arr;
  const overflow = arr.slice(0, arr.length - cap);
  await mongoose
    .model(archiveModelName)
    .insertMany(
      overflow.map((entry) => ({ ...baseRef, field, entry: toPlain(entry) })),
      { ordered: false }
    );
  return arr.slice(arr.length - cap);
}

export async function archiveOverflowAndTrim({
  parentModelName,
  parentId,
  archiveModelName,
  baseRef,
  doc,
  field,
  cap,
}) {
  const arr = readPath(doc, field);
  if (!Array.isArray(arr) || arr.length <= cap) return 0;
  const overflow = arr.slice(0, arr.length - cap);
  await mongoose
    .model(archiveModelName)
    .insertMany(
      overflow.map((entry) => ({ ...baseRef, field, entry: toPlain(entry) })),
      { ordered: false }
    );
  await mongoose
    .model(parentModelName)
    .updateOne({ _id: parentId }, { $push: { [field]: { $each: [], $slice: -cap } } });
  return overflow.length;
}
