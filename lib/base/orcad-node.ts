/** Base class for every public node in the OrCAD model. */
export abstract class OrcadNode {
  abstract readonly type: string

  /** Returns direct children without exposing mutable internal collections. */
  abstract getChildren(): readonly OrcadNode[]
}
