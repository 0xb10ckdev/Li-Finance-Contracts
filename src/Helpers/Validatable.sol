// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.16;

import { LibAsset } from "../Libraries/LibAsset.sol";
import { LibUtil } from "../Libraries/LibUtil.sol";
import { InvalidReceiver, InvalidSendingToken, InvalidAmount, NativeAssetNotSupported, InvalidDestinationChain } from "../Errors/GenericErrors.sol";
import { ILiFi } from "../Interfaces/ILiFi.sol";
import { LibSwap } from "../Libraries/LibSwap.sol";

contract Validatable {
    modifier validateBridgeData(ILiFi.BridgeData memory _bridgeData) {
        if (LibUtil.isZeroAddress(_bridgeData.receiver)) {
            revert InvalidReceiver();
        }
        if (_bridgeData.minAmount == 0) {
            revert InvalidAmount();
        }
        _;
    }

    modifier noNativeAsset(ILiFi.BridgeData memory _bridgeData) {
        if (LibAsset.isNativeAsset(_bridgeData.sendingAssetId)) {
            revert NativeAssetNotSupported();
        }
        _;
    }

    modifier receiverMustBeSender(ILiFi.BridgeData memory _bridgeData) {
        if (_bridgeData.receiver != msg.sender) {
            revert InvalidReceiver();
        }
        _;
    }

    modifier onlyAllowSourceToken(ILiFi.BridgeData memory _bridgeData, address _token) {
        if (_bridgeData.sendingAssetId != _token) {
            revert InvalidSendingToken();
        }
        _;
    }

    modifier onlyAllowDestinationChain(ILiFi.BridgeData memory _bridgeData, uint256 _chainId) {
        if (_bridgeData.destinationChainId != _chainId) {
            revert InvalidDestinationChain();
        }
        _;
    }
}
