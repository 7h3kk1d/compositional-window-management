import { describe, expect, it } from 'vitest'
import { collectOrphans, refCount } from '@cwm/core'
import { seedDoc } from './seed'

describe('seed', () => {
  it('builds a valid doc with a mirrored note and a mirrored container', () => {
    const doc = seedDoc()
    const mirrored = Object.values(doc.nodes).filter((n) => refCount(doc, n.id) > 1)
    expect(mirrored.map((n) => n.title).sort()).toEqual(['Ideas (mirrored)', 'Projects', 'Sketchpad', 'Write the post'])
    expect(collectOrphans(doc)).toEqual([])
  })
})
