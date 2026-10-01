const { expect } = require('chai')
const { collectSystem, memoryShape, driveShape, networkShape, cpuShape } = require('../../lib/util/systemStats')

// node-os-utils 3 returns { success, data } with byte counts; the System page of the admin reads the shape of version 1.

const GB = 1024 ** 3
const MB = 1024 ** 2
const bytes = (value) => ({ bytes: value })

describe('system stats (unit)', () => {
  describe('memoryShape', () => {
    it('gives megabytes and the free percentage', () => {
      const shape = memoryShape({ total: bytes(8 * GB), used: bytes(6 * GB), available: bytes(2 * GB), free: bytes(1 * GB) })
      expect(shape).to.deep.equal({ totalMemMb: 8192, usedMemMb: 6144, freeMemMb: 2048, freeMemPercentage: 25 })
    })

    it('falls back to free when there is no available figure', () => {
      expect(memoryShape({ total: bytes(4 * GB), used: bytes(3 * GB), free: bytes(1 * GB) }).freeMemPercentage).to.equal(25)
    })

    it('is 0, like before, when nothing could be read', () => {
      expect(memoryShape(undefined)).to.equal(0)
      expect(memoryShape({ total: bytes(0) })).to.equal(0)
    })
  })

  describe('driveShape', () => {
    const disks = [
      { mountpoint: 'C:\\', total: bytes(100 * GB), used: bytes(40 * GB) },
      { mountpoint: 'D:\\', total: bytes(200 * GB), used: bytes(150 * GB) },
      { mountpoint: 'D:\\data', total: bytes(50 * GB), used: bytes(5 * GB) }
    ]

    it('picks the drive that holds the working directory', () => {
      expect(driveShape(disks, 'D:\\claude\\node-cms')).to.deep.equal({ totalGb: 200, usedGb: 150, usedPercentage: 75 })
    })

    it('prefers the longest matching mount point', () => {
      expect(driveShape(disks, 'D:\\data\\store').totalGb).to.equal(50)
    })

    it('matches drive letters whatever their case', () => {
      expect(driveShape(disks, 'c:\\Users\\me').totalGb).to.equal(100)
    })

    it('holds whole folder names only', () => {
      expect(driveShape([{ mountpoint: '/', total: bytes(10 * GB), used: bytes(1 * GB) }, { mountpoint: '/data', total: bytes(20 * GB), used: bytes(2 * GB) }], '/database/files').totalGb).to.equal(10)
      expect(driveShape([{ mountpoint: '/', total: bytes(10 * GB), used: bytes(1 * GB) }, { mountpoint: '/data', total: bytes(20 * GB), used: bytes(2 * GB) }], '/data/files').totalGb).to.equal(20)
    })

    it('takes the first disk when none holds the directory', () => {
      expect(driveShape(disks, 'Z:\\nowhere').totalGb).to.equal(100)
    })

    it('is "not supported" without disks or without a size', () => {
      expect(driveShape([], 'C:\\')).to.equal('not supported')
      expect(driveShape(undefined, 'C:\\')).to.equal('not supported')
      expect(driveShape([{ mountpoint: 'C:\\', total: bytes(0), used: bytes(0) }], 'C:\\')).to.equal('not supported')
    })
  })

  describe('networkShape', () => {
    it('gives the totals in megabytes where the page reads them', () => {
      const shape = networkShape({ totalRxBytes: bytes(10 * MB), totalTxBytes: bytes(2 * MB) })
      expect(shape.total).to.deep.equal({ inputMb: 10, outputMb: 2 })
    })

    it('is "not supported" without an overview', () => {
      expect(networkShape(undefined)).to.equal('not supported')
      expect(networkShape({})).to.equal('not supported')
    })
  })

  describe('cpuShape', () => {
    it('counts the cores and names the model', () => {
      expect(cpuShape(12.5, [{ model: 'Fast CPU' }, { model: 'Fast CPU' }])).to.deep.equal({ count: 2, usage: 12.5, model: 'Fast CPU' })
    })

    it('uses 0 and "Unknown" when there is nothing to read', () => {
      expect(cpuShape(undefined, [])).to.deep.equal({ count: 0, usage: 0, model: 'Unknown' })
    })
  })

  describe('collectSystem', () => {
    const monitor = {
      cpu: { usage: async () => ({ success: true, data: 33 }) },
      memory: { info: async () => ({ success: true, data: { total: bytes(2 * GB), used: bytes(1 * GB), available: bytes(1 * GB) } }) },
      disk: { usage: async () => ({ success: true, data: [{ mountpoint: '/', total: bytes(10 * GB), used: bytes(5 * GB) }] }) },
      network: { overview: async () => ({ success: true, data: { totalRxBytes: bytes(MB), totalTxBytes: bytes(MB) } }) }
    }
    const host = { cpus: [{ model: 'Test CPU' }], cwd: '/srv/cms' }

    it('assembles the report the admin page reads', async () => {
      const report = await collectSystem({ monitor, host })
      expect(report.cpu).to.deep.equal({ count: 1, usage: 33, model: 'Test CPU' })
      expect(report.memory.freeMemPercentage).to.equal(50)
      expect(report.drive.usedPercentage).to.equal(50)
      expect(report.network.total).to.deep.equal({ inputMb: 1, outputMb: 1 })
      expect(report.uptime).to.be.a('number')
    })

    it('replaces what cannot be read by its default instead of failing', async () => {
      const broken = {
        cpu: { usage: async () => { throw new Error('no cpu') } },
        memory: { info: async () => ({ success: false }) },
        disk: { usage: async () => { throw new Error('no disk') } },
        network: { overview: async () => undefined }
      }
      const report = await collectSystem({ monitor: broken, host })
      expect(report.cpu.usage).to.equal(0)
      expect(report.memory).to.equal(0)
      expect(report.drive).to.equal('not supported')
      expect(report.network).to.equal('not supported')
    })

    it('works against the real operating system', async () => {
      const report = await collectSystem()
      expect(report.cpu.count).to.be.above(0)
      expect(report.cpu.usage).to.be.within(0, 100)
      expect(report.memory.totalMemMb).to.be.above(0)
    })
  })
})
