/**
 * Discovery-module registration. Importing this file registers every
 * built-in module with the discovery registry (side-effect imports).
 * Module coverage vs LibreNMS is tracked in the parity matrix.
 */
import './core'
import './ports'
import './addresses'
import './switching'
import './health'
import './routing'
