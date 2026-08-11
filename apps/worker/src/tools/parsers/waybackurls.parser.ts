import { parseUrlArchive } from "./url-archive.parser.js";
export const parseWaybackurls = (path: string) => parseUrlArchive(path, "waybackurls");
