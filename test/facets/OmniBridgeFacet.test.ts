import {
  IERC20 as ERC20,
  IERC20__factory as ERC20__factory,
  OmniBridgeFacet,
  DexManagerFacet,
} from '../../typechain'
import { deployments, network } from 'hardhat'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers'
import { constants, Contract, utils } from 'ethers'
import { node_url } from '../../utils/network'
import { expect } from '../chai-setup'
import approvedFunctionSelectors from '../../utils/approvedFunctions'
import config from '../../config/omni'

const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const DAI_L1_ADDRESS = '0x6B175474E89094C44Da98b954EedeAC495271d0F'
const DAI_L2_ADDRESS = '0x44fA8E6f47987339850636F88629646662444217'
const WETH_L2_ADDRESS = '0x6A023CCd1ff6F2045C3309768eAd9E68F978f6e1'
const UNISWAP_ADDRESS = '0xE592427A0AEce92De3Edee1F18E0157C05861564'
const ZERO_ADDRESS = constants.AddressZero
const SEND_AMOUNT = utils.parseEther('1000')
const SWAP_AMOUNT_IN = utils.parseUnits('1020', 6)
const SWAP_AMOUNT_OUT = utils.parseEther('1000')

describe('OmniBridgeFacet', function () {
  let alice: SignerWithAddress
  let lifi: OmniBridgeFacet
  let dexMgr: DexManagerFacet
  let owner: SignerWithAddress
  let dai: ERC20
  let usdc: ERC20
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let validLiFiData: any
  let validBridgeData: any
  let swapData: any
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      await deployments.fixture('DeployOmniBridgeFacet')

      owner = await ethers.getSigners()
      owner = owner[0]
      const diamond = await ethers.getContract('LiFiDiamond')
      lifi = <OmniBridgeFacet>(
        await ethers.getContractAt('OmniBridgeFacet', diamond.address)
      )

      dexMgr = <DexManagerFacet>(
        await ethers.getContractAt('DexManagerFacet', diamond.address)
      )
      await dexMgr.addDex(UNISWAP_ADDRESS)
      await dexMgr.batchSetFunctionApprovalBySignature(
        approvedFunctionSelectors,
        true
      )

      await network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: ['0xaD0135AF20fa82E106607257143d0060A7eB5cBf'],
      })

      alice = await ethers.getSigner(
        '0xaD0135AF20fa82E106607257143d0060A7eB5cBf'
      )

      dai = ERC20__factory.connect(DAI_L1_ADDRESS, alice)
      usdc = ERC20__factory.connect(USDC_ADDRESS, alice)

      validLiFiData = {
        transactionId: utils.randomBytes(32),
        integrator: 'ACME Devs',
        referrer: ZERO_ADDRESS,
        sendingAssetId: DAI_L1_ADDRESS,
        receivingAssetId: DAI_L2_ADDRESS,
        receiver: alice.address,
        destinationChainId: 100,
        amount: SEND_AMOUNT,
      }
      validBridgeData = {
        receiver: alice.address,
        assetId: DAI_L1_ADDRESS,
        amount: SEND_AMOUNT,
        bridge: config['mainnet'].foreignOmniBridge,
      }

      const deadline = Math.floor(Date.now() / 1000) + 60 * 20 // 20 minutes from the current Unix time

      const uniswap = new Contract(
        UNISWAP_ADDRESS,
        [
          'function exactOutputSingle(tuple(address,address,uint24,address,uint256,uint256,uint256,uint160)) external payable returns (uint256)',
        ],
        alice
      )

      // Generate swap calldata
      const swapCallData = await uniswap.populateTransaction.exactOutputSingle([
        USDC_ADDRESS,
        DAI_L1_ADDRESS,
        3000,
        lifi.address,
        deadline,
        SWAP_AMOUNT_OUT,
        SWAP_AMOUNT_IN,
        0,
      ])

      swapData = [
        {
          callTo: <string>swapCallData.to,
          approveTo: <string>swapCallData.to,
          sendingAssetId: USDC_ADDRESS,
          receivingAssetId: DAI_L1_ADDRESS,
          callData: <string>swapCallData?.data,
          fromAmount: SWAP_AMOUNT_IN,
        },
      ]

      // Approve ERC20 for swapping
      await usdc.approve(lifi.address, SWAP_AMOUNT_IN)
      await dai.approve(lifi.address, SEND_AMOUNT)
    }
  )

  before(async function () {
    this.timeout(0)
    await network.provider.request({
      method: 'hardhat_reset',
      params: [
        {
          forking: {
            jsonRpcUrl: node_url('mainnet'),
            blockNumber: 14954000,
          },
        },
      ],
    })
  })

  beforeEach(async function () {
    this.timeout(0)
    await setupTest()
  })

  describe('startBridgeTokensViaOmniBridge function', () => {
    describe('should be reverted to starts a bridge transaction', () => {
      it('when the sending amount is zero', async function () {
        const bridgeData = {
          ...validBridgeData,
          amount: '0',
        }

        await expect(
          lifi
            .connect(alice)
            .startBridgeTokensViaOmniBridge(validLiFiData, bridgeData)
        ).to.be.revertedWith('InvalidAmount()')
      })

      it('when the receiver is zero address', async function () {
        const bridgeData = {
          ...validBridgeData,
          receiver: ZERO_ADDRESS,
        }

        await expect(
          lifi
            .connect(alice)
            .startBridgeTokensViaOmniBridge(validLiFiData, bridgeData)
        ).to.be.revertedWith('InvalidReceiver()')
      })

      it('when the user does not have enough amount', async () => {
        const daiBalance = await dai.balanceOf(alice.address)
        await dai.transfer(lifi.address, daiBalance)

        await expect(
          lifi
            .connect(alice)
            .startBridgeTokensViaOmniBridge(validLiFiData, validBridgeData)
        ).to.be.revertedWith('Dai/insufficient-balance')
      })

      it('when the sending native asset amount is not enough', async () => {
        const bridgeData = {
          ...validBridgeData,
          assetId: ZERO_ADDRESS,
          amount: utils.parseEther('10'),
        }

        await expect(
          lifi
            .connect(alice)
            .startBridgeTokensViaOmniBridge(validLiFiData, bridgeData, {
              value: utils.parseEther('9'),
            })
        ).to.be.revertedWith('InvalidAmount()')
      })
    })

    describe('should be possible to starts a bridge transaction', () => {
      it('when transfer non-native asset', async function () {
        await expect(
          lifi
            .connect(alice)
            .startBridgeTokensViaOmniBridge(validLiFiData, validBridgeData)
        )
          .to.emit(lifi, 'LiFiTransferStarted')
          .withArgs(
            utils.hexlify(validLiFiData.transactionId),
            'omni',
            '',
            validLiFiData.integrator,
            validLiFiData.referrer,
            validLiFiData.sendingAssetId,
            DAI_L2_ADDRESS,
            validLiFiData.receiver,
            validLiFiData.amount,
            validLiFiData.destinationChainId,
            false,
            false
          )
      })

      it('when transfer native asset', async function () {
        const bridgeData = {
          ...validBridgeData,
          assetId: ZERO_ADDRESS,
          amount: utils.parseEther('10'),
          bridge: config['mainnet'].wethOmniBridge,
        }
        const lifiData = {
          ...validLiFiData,
          receivingAssetId: WETH_L2_ADDRESS,
        }

        await expect(
          lifi
            .connect(alice)
            .startBridgeTokensViaOmniBridge(lifiData, bridgeData, {
              value: utils.parseEther('10'),
            })
        )
          .to.emit(lifi, 'LiFiTransferStarted')
          .withArgs(
            utils.hexlify(lifiData.transactionId),
            'omni',
            '',
            lifiData.integrator,
            lifiData.referrer,
            lifiData.sendingAssetId,
            lifiData.receivingAssetId,
            lifiData.receiver,
            lifiData.amount,
            lifiData.destinationChainId,
            false,
            false
          )
      })
    })
  })

  describe('swapAndStartBridgeTokensViaOmniBridge function', () => {
    describe('should be reverted to perform a swap then starts a bridge transaction', () => {
      it('when the receiver is zero address', async function () {
        const bridgeData = {
          ...validBridgeData,
          receiver: ZERO_ADDRESS,
        }

        await expect(
          lifi
            .connect(alice)
            .swapAndStartBridgeTokensViaOmniBridge(
              validLiFiData,
              swapData,
              bridgeData
            )
        ).to.be.revertedWith('InvalidReceiver()')
      })

      it('when the user does not have enough amount', async () => {
        const usdcBalance = await usdc.balanceOf(alice.address)
        await usdc.transfer(dai.address, usdcBalance)

        await expect(
          lifi
            .connect(alice)
            .swapAndStartBridgeTokensViaOmniBridge(
              validLiFiData,
              swapData,
              validBridgeData
            )
        ).to.be.revertedWith('ERC20: transfer amount exceeds balance')
      })

      it('when the dex is not approved', async function () {
        await dexMgr.removeDex(UNISWAP_ADDRESS)

        await expect(
          lifi
            .connect(alice)
            .swapAndStartBridgeTokensViaOmniBridge(
              validLiFiData,
              swapData,
              validBridgeData
            )
        ).to.be.revertedWith('ContractCallNotAllowed()')
      })
    })

    it('should be possible to perform a swap then starts a bridge transaction', async function () {
      await expect(
        lifi
          .connect(alice)
          .swapAndStartBridgeTokensViaOmniBridge(
            validLiFiData,
            swapData,
            validBridgeData
          )
      )
        .to.emit(lifi, 'AssetSwapped')
        .and.to.emit(lifi, 'LiFiTransferStarted')
        .withArgs(
          utils.hexlify(validLiFiData.transactionId),
          'omni',
          '',
          validLiFiData.integrator,
          validLiFiData.referrer,
          validLiFiData.sendingAssetId,
          validLiFiData.receivingAssetId,
          validLiFiData.receiver,
          validLiFiData.amount,
          validLiFiData.destinationChainId,
          true,
          false
        )
    })
  })
})
