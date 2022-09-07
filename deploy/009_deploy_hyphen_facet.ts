import { ethers, network } from 'hardhat'
import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { addOrReplaceFacets } from '../utils/diamond'
import { utils } from 'ethers'
import config from '../config/hyphen'
import { verifyContract } from './9999_verify_all_facets'

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { deploy } = deployments
  const { deployer } = await getNamedAccounts()

  await deploy('HyphenFacet', {
    from: deployer,
    log: true,
    deterministicDeployment: true,
  })

  const hyphenFacet = await ethers.getContract('HyphenFacet')
  const diamond = await ethers.getContract('LiFiDiamond')

  await addOrReplaceFacets([hyphenFacet], diamond.address)

  await verifyContract(hre, 'HyphenFacet', { address: hyphenFacet.address })
}

export default func
func.id = 'deploy_hyphen_facet'
func.tags = ['DeployHyphenFacet']
func.dependencies = [
  'InitialFacets',
  'LiFiDiamond',
  'InitFacets',
  'DeployDexManagerFacet',
]
