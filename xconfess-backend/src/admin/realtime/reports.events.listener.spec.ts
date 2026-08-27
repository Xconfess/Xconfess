import { ReportsEventsListener } from './reports.events.listener';

describe('ReportsEventsListener', () => {
  it('emits to gateway on report.created', () => {
    const gateway: any = { emitNewReport: jest.fn() };
    const listener = new ReportsEventsListener(gateway);
    listener.handleReportCreated({ reportId: 'r1' });
    expect(gateway.emitNewReport).toHaveBeenCalledWith({ reportId: 'r1' });
  });

  it('fans out each created report event to gateway subscribers', () => {
    const gateway: any = { emitNewReport: jest.fn() };
    const listener = new ReportsEventsListener(gateway);
    const events = [
      { reportId: 'r1', scope: 'global' },
      { reportId: 'r2', scope: 'channel:abuse' },
      { reportId: 'r3', scope: 'channel:spam' },
    ];

    events.forEach((event) => listener.handleReportCreated(event));

    expect(gateway.emitNewReport).toHaveBeenCalledTimes(events.length);
    expect(gateway.emitNewReport).toHaveBeenNthCalledWith(1, events[0]);
    expect(gateway.emitNewReport).toHaveBeenNthCalledWith(2, events[1]);
    expect(gateway.emitNewReport).toHaveBeenNthCalledWith(3, events[2]);
  });
});
