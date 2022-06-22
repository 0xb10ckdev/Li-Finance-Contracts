import { ethers, network } from 'hardhat'
import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { addOrReplaceFacets } from '../utils/diamond'
import { utils } from 'ethers'
import config from '../config/across'

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { deploy } = deployments
  const { deployer } = await getNamedAccounts()

  if (config[network.name] === undefined) {
    console.info('Not deploying AcrossFacet because acrossSpokePool is not set')
    return
  }

  const spokePool = config[network.name].acrossSpokePool
  const weth = config[network.name].weth

  await deploy('AcrossFacet', {
    from: deployer,
    log: true,
    deterministicDeployment: true,
  })

  const acrossFacet = await ethers.getContract('AcrossFacet')

  const diamond = await ethers.getContract('LiFiDiamond')

  const ABI = ['function initAcross(address,address)']
  const iface = new utils.Interface(ABI)
  const initData = iface.encodeFunctionData('initAcross', [weth, spokePool])

  await addOrReplaceFacets(
    [acrossFacet],
    diamond.address,
    acrossFacet.address,
    initData
  )
}

export default func
func.id = 'deploy_across_facet'
func.tags = ['DeployAcrossFacet']
func.dependencies = [
  'InitialFacets',
  'LiFiDiamond',
  'InitFacets',
  'DeployDexManagerFacet',
]
