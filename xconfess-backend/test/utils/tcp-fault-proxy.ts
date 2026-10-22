import { createConnection, createServer, Server, Socket } from 'node:net';

/** Real TCP failures without stopping a shared developer/CI Redis server. */
export class TcpFaultProxy {
  private readonly sockets = new Set<Socket>();
  private readonly pairs: [Socket, Socket][] = [];
  private readonly server: Server;

  constructor(host: string, port: number) {
    this.server = createServer((downstream) => {
      const upstream = createConnection({ host, port });
      this.pairs.push([downstream, upstream]);
      for (const socket of [downstream, upstream]) {
        this.sockets.add(socket);
        socket.on('error', () => socket.destroy());
        socket.on('close', () => this.sockets.delete(socket));
      }
      downstream.pipe(upstream).pipe(downstream);
    });
  }

  async start(): Promise<number> {
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(0, '127.0.0.1', resolve);
    });
    return (this.server.address() as { port: number }).port;
  }

  stall(): void {
    for (const [downstream, upstream] of this.pairs) {
      downstream.unpipe(upstream);
      upstream.unpipe(downstream);
    }
  }

  disconnect(): void {
    for (const socket of this.sockets) socket.destroy();
  }

  async close(): Promise<void> {
    this.disconnect();
    if (this.server.listening)
      await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}

export async function eventually(
  assertion: () => Promise<void> | void,
  timeout = 5000,
): Promise<void> {
  const deadline = Date.now() + timeout;
  for (;;) {
    try {
      await assertion();
      return;
    } catch (error) {
      if (Date.now() >= deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
}
