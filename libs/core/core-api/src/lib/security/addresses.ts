import { BlockList, isIP } from 'node:net';

/** Splits `10.0.0.0/8` into address, family and prefix length; `null` if it is no address or network. */
function parse(entry: string): { address: string; family: 'ipv4' | 'ipv6'; prefix: number | null } | null {
  const [address, prefix] = entry.trim().split('/');
  const version = isIP(address);
  if (!version) return null;
  const family = version === 4 ? 'ipv4' : 'ipv6';
  if (prefix === undefined) return { address, family, prefix: null };
  const length = Number(prefix);
  if (!Number.isInteger(length) || length < 0 || length > (version === 4 ? 32 : 128)) return null;
  return { address, family, prefix: length };
}

/** Is the entry an IPv4/IPv6 address or network (`tokens.addressInvalid` otherwise)? */
export function validAddressEntry(entry: string): boolean {
  return parse(entry) !== null;
}

/** Does the client address match one of the entries (addresses or networks)? IPv4 mapped into IPv6 counts as IPv4. */
export function addressAllowed(ip: string | null | undefined, entries: readonly string[]): boolean {
  const client = (ip ?? '').replace(/^::ffff:/i, '');
  const version = isIP(client);
  if (!version) return false;
  const list = new BlockList();
  for (const entry of entries) {
    const parsed = parse(entry);
    if (!parsed) continue;
    if (parsed.prefix === null) list.addAddress(parsed.address, parsed.family);
    else list.addSubnet(parsed.address, parsed.prefix, parsed.family);
  }
  return list.check(client, version === 4 ? 'ipv4' : 'ipv6');
}
