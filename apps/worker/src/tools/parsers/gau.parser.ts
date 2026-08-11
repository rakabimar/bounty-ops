import { parseUrlArchive } from "./url-archive.parser.js";
export const parseGau = (path: string) => parseUrlArchive(path, "gau");
